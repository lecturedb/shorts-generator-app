import "server-only";

import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import { assertWorkflowStepIncluded } from "../workflow-configuration";
import { applyVoiceConfiguration } from "../voice-generation-project";
import type { VoiceConfigurationAction, VoiceGenerationRunResult } from "../voice-generation-types";
import { parseVoiceGenerationInput, voiceInputSettings } from "../voice-generation-validation";
import { generateVoiceWithFal } from "./fal-voice-generation";
import { listProjects } from "./project-management";
import { loadProjectDocument, ProjectStorageError, resolveProjectFilePath, saveProjectDocument } from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveVoiceRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveVoiceRuns ??= new Set<string>();

function runKey(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function voiceStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "voice");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "더빙 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown): string {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) {
    throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  }
  return `run-voice-${requestId}`;
}

function isMp3(bytes: Uint8Array) {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

async function downloadMp3(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3 * 60_000) });
  if (!response.ok) throw new Error("생성 음성을 프로젝트로 다운로드하지 못했습니다.");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error("생성 음성이 허용 크기를 초과했습니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("생성 음성 파일 크기가 올바르지 않습니다.");
  if (!isMp3(bytes)) throw new Error("fal.ai 결과가 MP3 파일이 아닙니다.");
  return bytes;
}

async function writeAudioAtomically(projectId: string, relativePath: string, bytes: Uint8Array) {
  const destination = resolveProjectFilePath(projectId, relativePath);
  const temporary = path.join(path.dirname(destination), `.voice-${randomUUID()}.tmp`);
  let created = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    created = false;
  } finally {
    if (created) await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function startVoiceGeneration(
  projectId: string,
  requestId: unknown,
  rawInput: unknown,
): Promise<VoiceGenerationRunResult & { created: boolean }> {
  const runId = runIdFor(requestId);
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  assertWorkflowStepIncluded(project, "voice");
  let input;
  try {
    input = parseVoiceGenerationInput(rawInput);
  } catch (error) {
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "더빙 설정이 올바르지 않습니다.");
  }
  if (!project.script.text.trim()) throw new ProjectStorageError("WRITE_FAILED", "더빙할 전체 대본이 없습니다.");
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(key)) return { runId, status: "실행 중", project, created: false };

  const now = new Date().toISOString();
  project.runs.push({
    id: runId,
    stageId: "voice",
    label: "fal.ai 전체 더빙 생성",
    status: "실행 중",
    message: "전체 대본으로 더빙을 생성하고 있습니다.",
    startedAt: now,
    resultAssetIds: [],
  });
  project.voice.input = voiceInputSettings(input);
  project.voice.status = "요청 중";
  project.voice.error = null;
  const step = voiceStep(project);
  step.status = "실행 중";
  step.summary = "전체 더빙 생성 중";
  project.project.status = "실행 중";
  project.project.updatedAt = now;
  activeRuns.add(key);
  try {
    return { runId, status: "실행 중", project: await saveProjectDocument(project), created: true };
  } catch (error) {
    activeRuns.delete(key);
    throw error;
  }
}

export async function performVoiceGeneration(projectId: string, runId: string, rawInput: unknown): Promise<void> {
  const key = runKey(projectId, runId);
  try {
    const input = parseVoiceGenerationInput(rawInput);
    let project = await loadProjectDocument(projectId);
    const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "voice");
    if (!run || run.status !== "실행 중") return;
    project.voice.status = "처리 중";
    await saveProjectDocument(project);

    try {
      const scriptText = project.script.text.trim();
      const generated = await generateVoiceWithFal(scriptText, input);
      const bytes = await downloadMp3(generated.audio.url);
      const assetId = `asset-voice-${randomUUID()}`;
      const relativePath = `audio/narration-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`;
      await writeAudioAtomically(projectId, relativePath, bytes);

      project = await loadProjectDocument(projectId);
      const currentRun = project.runs.find((candidate) => candidate.id === runId);
      if (!currentRun || currentRun.status !== "실행 중") return;
      const selectedCandidate = project.assets.find((asset) => asset.id === project.voice.selectedAssetId);
      const selectNewCandidate = selectedCandidate === undefined || selectedCandidate.stale.isStale;
      if (selectNewCandidate) {
        for (const asset of project.assets) {
          if (asset.role === "narration") asset.selected = false;
        }
      }
      project.assets.push({
        id: assetId,
        label: `전체 더빙 후보 ${project.voice.assetIds.length + 1}`,
        kind: "audio",
        role: "narration",
        stageId: "voice",
        relativePath,
        createdAt: new Date().toISOString(),
        selected: selectNewCandidate,
        sourceAssetIds: [],
        stale: { isStale: false },
        metadata: { format: "MP3" },
      });
      project.voice.assetIds.push(assetId);
      if (generated.timestamps.length > 0) {
        project.voice.timestamps.push({ assetId, items: generated.timestamps });
      }
      if (selectNewCandidate) project.voice.selectedAssetId = assetId;
      project.voice.provider = "fal.ai";
      project.voice.model = generated.model;
      project.voice.endpoint = generated.model;
      project.voice.input = voiceInputSettings(input);
      project.voice.status = "완료";
      project.voice.error = null;
      currentRun.status = "완료";
      currentRun.message = generated.timestamps.length > 0
        ? `전체 더빙 MP3와 타임스탬프 ${generated.timestamps.length}개를 저장했습니다.`
        : "전체 더빙 MP3를 저장했습니다. 모델 응답에는 타임스탬프가 없었습니다.";
      currentRun.endedAt = new Date().toISOString();
      currentRun.resultAssetIds.push(assetId);
      const step = voiceStep(project);
      step.status = "완료";
      step.summary = `더빙 후보 ${project.voice.assetIds.length}개`;
      step.settings = { provider: "fal.ai", model: generated.model, ...voiceInputSettings(input) };
      project.project.status = "완료";
      project.project.updatedAt = currentRun.endedAt;
      await saveProjectDocument(project);
    } catch (error) {
      project = await loadProjectDocument(projectId);
      const failedRun = project.runs.find((candidate) => candidate.id === runId);
      const message = error instanceof Error ? error.message : "더빙 생성에 실패했습니다.";
      if (failedRun?.status === "실행 중") {
        failedRun.status = "실패";
        failedRun.message = "더빙 생성에 실패했습니다. 기존 후보와 다른 단계 결과는 유지했습니다.";
        failedRun.errorSummary = message;
        failedRun.endedAt = new Date().toISOString();
      }
      project.voice.status = "실패";
      project.voice.error = message;
      const step = voiceStep(project);
      step.status = "실패";
      step.summary = "더빙 생성 실패";
      project.project.status = "실패";
      project.project.updatedAt = new Date().toISOString();
      await saveProjectDocument(project).catch(() => undefined);
    }
  } finally {
    activeRuns.delete(key);
  }
}

export async function getVoiceGenerationRun(projectId: string, runIdInput: string): Promise<VoiceGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-voice-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "voice");
  if (!run) throw new ProjectStorageError("READ_FAILED", "더빙 생성 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(key)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 실행 결과 확인이 필요합니다. 기존 더빙 후보는 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    project.voice.status = "확인 필요";
    voiceStep(project).status = "확인 필요";
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function updateVoiceConfiguration(projectId: string, rawAction: unknown) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) {
    throw new ProjectStorageError("WRITE_FAILED", "더빙 설정 요청이 올바르지 않습니다.");
  }
  const action = rawAction as VoiceConfigurationAction;
  if (action.action !== "select-voice" || typeof action.assetId !== "string") {
    throw new ProjectStorageError("WRITE_FAILED", "더빙 후보 선택 정보가 올바르지 않습니다.");
  }
  try {
    return await saveProjectDocument(applyVoiceConfiguration(await loadProjectDocument(projectId), action));
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "더빙 설정을 저장하지 못했습니다.", { cause: error });
  }
}

export async function voiceProjectSummaries() {
  return (await listProjects()).projects;
}
