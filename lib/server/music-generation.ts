import "server-only";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import { applyMusicConfiguration, applyMusicSettings } from "../music-generation-project";
import { syncEditingTimelineAudioSelections } from "../editing-timeline";
import type { MusicConfigurationAction, MusicGenerationRunResult } from "../music-generation-types";
import { parseMusicGenerationInput } from "../music-generation-validation";
import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import { assertWorkflowStepIncluded } from "../workflow-configuration";
import { generateMusicWithFal } from "./fal-music-generation";
import { listProjects } from "./project-management";
import { loadProjectDocument, ProjectStorageError, resolveProjectFilePath, saveProjectDocument } from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveMusicRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveMusicRuns ??= new Set<string>();

function runKey(projectId: string, runId: string) { return `${projectId}:${runId}`; }

function musicStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "music");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "배경음악 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown) {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  return `run-music-${requestId}`;
}

function isMp3(bytes: Uint8Array) {
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

async function downloadAudio(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error("생성 음악을 프로젝트로 다운로드하지 못했습니다.");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error("생성 음악이 허용 크기를 초과했습니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("생성 음악 파일 크기가 올바르지 않습니다.");
  return bytes;
}

async function writeBytes(filePath: string, bytes: Uint8Array) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function transcodeToMp3(inputPath: string, outputPath: string, bitrate: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-nostdin", "-y", "-i", inputPath, "-vn", "-codec:a", "libmp3lame", "-b:a", bitrate, outputPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("FFmpeg MP3 변환 시간이 초과되었습니다.")); }, 3 * 60_000);
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_000) stderr += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timeout); reject(new Error("FFmpeg를 실행할 수 없습니다. 설치 상태를 확인해 주세요.", { cause: error })); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`음악을 MP3로 변환하지 못했습니다.${stderr ? ` ${stderr.slice(-500)}` : ""}`));
    });
  });
}

async function probeMp3(filePath: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("MP3 재생 가능 여부 확인 시간이 초과되었습니다.")); }, 30_000);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 2_000) stderr += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timeout); reject(new Error("ffprobe를 실행할 수 없습니다. FFmpeg 설치 상태를 확인해 주세요.", { cause: error })); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      const duration = Number(stdout.trim());
      if (code === 0 && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(`저장된 MP3 파일을 재생 가능한 오디오로 확인하지 못했습니다.${stderr ? ` ${stderr.trim().slice(-300)}` : ""}`));
    });
  });
}

async function saveMp3(projectId: string, relativePath: string, bytes: Uint8Array, bitrate: string) {
  const destination = resolveProjectFilePath(projectId, relativePath);
  const token = randomUUID();
  const source = path.join(path.dirname(destination), `.music-source-${token}.tmp`);
  const output = path.join(path.dirname(destination), `.music-output-${token}.mp3`);
  try {
    if (isMp3(bytes)) await writeBytes(output, bytes);
    else {
      await writeBytes(source, bytes);
      await transcodeToMp3(source, output, bitrate);
    }
    const saved = new Uint8Array(await readFile(output));
    if (!isMp3(saved)) throw new Error("저장 결과가 유효한 MP3 파일이 아닙니다.");
    const durationSeconds = await probeMp3(output);
    await rename(output, destination);
    return durationSeconds;
  } finally {
    await Promise.all([rm(source, { force: true }), rm(output, { force: true })]);
  }
}

export async function startMusicGeneration(projectId: string, requestId: unknown, rawInput: unknown): Promise<MusicGenerationRunResult & { created: boolean }> {
  const runId = runIdFor(requestId);
  const key = runKey(projectId, runId);
  let project = await loadProjectDocument(projectId);
  assertWorkflowStepIncluded(project, "music");
  let input;
  try { input = parseMusicGenerationInput(rawInput); }
  catch (error) { throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "음악 설정이 올바르지 않습니다."); }
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(key)) return { runId, status: "실행 중", project, created: false };
  project = applyMusicSettings(project, input);
  const now = new Date().toISOString();
  project.runs.push({ id: runId, stageId: "music", label: "fal.ai 배경음악 생성", status: "실행 중", message: `${project.project.settings.targetDurationSeconds}초 배경음악을 생성하고 있습니다.`, startedAt: now, resultAssetIds: [] });
  project.music.status = "요청 중";
  project.music.error = null;
  const step = musicStep(project);
  step.status = "실행 중";
  step.summary = "배경음악 생성 중";
  project.project.status = "실행 중";
  project.project.updatedAt = now;
  activeRuns.add(key);
  try { return { runId, status: "실행 중", project: await saveProjectDocument(project), created: true }; }
  catch (error) { activeRuns.delete(key); throw error; }
}

export async function performMusicGeneration(projectId: string, runId: string, rawInput: unknown) {
  const key = runKey(projectId, runId);
  try {
    const input = parseMusicGenerationInput(rawInput);
    let project = await loadProjectDocument(projectId);
    const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "music");
    if (!run || run.status !== "실행 중") return;
    project.music.status = "처리 중";
    await saveProjectDocument(project);
    try {
      const targetDurationSeconds = project.project.settings.targetDurationSeconds;
      const generated = await generateMusicWithFal(input, targetDurationSeconds);
      const bytes = await downloadAudio(generated.audio.url);
      const assetId = `asset-music-${randomUUID()}`;
      const relativePath = `audio/music-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`;
      const actualDurationSeconds = await saveMp3(projectId, relativePath, bytes, input.bitrate);
      project = await loadProjectDocument(projectId);
      const currentRun = project.runs.find((candidate) => candidate.id === runId);
      if (!currentRun || currentRun.status !== "실행 중") return;
      const selectedCandidate = project.assets.find((asset) => asset.id === project.music.selectedAssetId);
      const selectNewCandidate = selectedCandidate === undefined || selectedCandidate.stale.isStale;
      if (selectNewCandidate) for (const asset of project.assets) if (asset.role === "background-music") asset.selected = false;
      project.assets.push({
        id: assetId,
        label: `배경음악 후보 ${project.music.assetIds.length + 1}`,
        kind: "audio",
        role: "background-music",
        stageId: "music",
        relativePath,
        createdAt: new Date().toISOString(),
        selected: selectNewCandidate,
        sourceAssetIds: [],
        stale: { isStale: false },
        metadata: { format: "MP3", durationSeconds: actualDurationSeconds },
      });
      project.music.assetIds.push(assetId);
      if (selectNewCandidate) {
        project.music.selectedAssetId = assetId;
        syncEditingTimelineAudioSelections(project);
      }
      project.music.provider = "fal.ai";
      project.music.model = generated.model;
      project.music.endpoint = generated.model;
      project.music.status = "완료";
      project.music.error = null;
      currentRun.status = "완료";
      currentRun.message = `목표 길이 ${targetDurationSeconds}초의 배경음악 MP3를 저장했습니다.`;
      currentRun.endedAt = new Date().toISOString();
      currentRun.resultAssetIds.push(assetId);
      const step = musicStep(project);
      step.status = "완료";
      step.summary = `음악 후보 ${project.music.assetIds.length}개`;
      step.settings = { provider: "fal.ai", model: generated.model, ...project.music.input };
      project.project.status = "완료";
      project.project.updatedAt = currentRun.endedAt;
      await saveProjectDocument(project);
    } catch (error) {
      project = await loadProjectDocument(projectId);
      const failedRun = project.runs.find((candidate) => candidate.id === runId);
      const message = error instanceof Error ? error.message : "배경음악 생성에 실패했습니다.";
      if (failedRun?.status === "실행 중") {
        failedRun.status = "실패";
        failedRun.message = "배경음악 생성에 실패했습니다. 기존 음악 후보와 이미지·영상·더빙 결과는 유지했습니다.";
        failedRun.errorSummary = message;
        failedRun.endedAt = new Date().toISOString();
      }
      project.music.status = "실패";
      project.music.error = message;
      const step = musicStep(project);
      step.status = "실패";
      step.summary = "배경음악 생성 실패";
      project.project.status = "실패";
      project.project.updatedAt = new Date().toISOString();
      await saveProjectDocument(project).catch(() => undefined);
    }
  } finally { activeRuns.delete(key); }
}

export async function getMusicGenerationRun(projectId: string, runIdInput: string): Promise<MusicGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-music-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "music");
  if (!run) throw new ProjectStorageError("READ_FAILED", "배경음악 생성 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(key)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 실행 결과 확인이 필요합니다. 기존 음악 후보는 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    project.music.status = "확인 필요";
    musicStep(project).status = "확인 필요";
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function updateMusicConfiguration(projectId: string, rawAction: unknown) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) throw new ProjectStorageError("WRITE_FAILED", "음악 설정 요청이 올바르지 않습니다.");
  const record = rawAction as Record<string, unknown>;
  let action: MusicConfigurationAction;
  if (record.action === "update-settings") action = { action: "update-settings", input: parseMusicGenerationInput(record.input) };
  else if (record.action === "select-music" && typeof record.assetId === "string") action = { action: "select-music", assetId: record.assetId };
  else throw new ProjectStorageError("WRITE_FAILED", "음악 설정 요청이 올바르지 않습니다.");
  try { return await saveProjectDocument(applyMusicConfiguration(await loadProjectDocument(projectId), action)); }
  catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "음악 설정을 저장하지 못했습니다.", { cause: error });
  }
}

export async function musicProjectSummaries() { return (await listProjects()).projects; }
