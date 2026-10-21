import "server-only";

import type { ImageGenerationRunResult } from "../image-generation-types";
import type { ProjectDocument } from "../project-schema";
import { loadProjectDocument, ProjectStorageError, saveProjectDocument } from "./project-storage";
import { generateVideoPromptsWithOpenAI } from "./openai-video-prompts";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveVideoPromptRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveVideoPromptRuns ??= new Set<string>();

function runIdFor(requestId: unknown) {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  return `run-video-prompt-${requestId}`;
}

function keyFor(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function validateTargets(project: ProjectDocument) {
  const targets = project.scenes.filter((scene) => scene.video.enabled);
  if (targets.length === 0) throw new ProjectStorageError("WRITE_FAILED", "영상 생성 대상으로 선택한 장면이 없습니다.");
  if (targets.some((scene) => !scene.video.startImageAssetId || (scene.video.mode === "start_end" && !scene.video.endImageAssetId))) {
    throw new ProjectStorageError("WRITE_FAILED", "영상 대상 장면의 시작·끝 이미지 선택을 완료해 주세요.");
  }
  return targets;
}

export async function startVideoPromptGeneration(projectId: string, requestId: unknown): Promise<ImageGenerationRunResult & { created: boolean }> {
  const runId = runIdFor(requestId);
  const key = keyFor(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  const targets = validateTargets(project);
  const now = new Date().toISOString();
  project.runs.push({
    id: runId,
    stageId: "image",
    label: "OpenAI 선택 장면 영상 프롬프트 생성",
    status: "실행 중",
    message: `${targets.length}개 선택 장면의 영상 프롬프트를 생성하고 있습니다.`,
    startedAt: now,
    resultAssetIds: [],
  });
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

export async function performVideoPromptGeneration(projectId: string, runId: string) {
  const key = keyFor(projectId, runId);
  try {
    const project = await loadProjectDocument(projectId);
    const run = project.runs.find((candidate) => candidate.id === runId);
    if (!run || run.status !== "실행 중") return;
    const generated = await generateVideoPromptsWithOpenAI(project);
    const latest = await loadProjectDocument(projectId);
    const latestRun = latest.runs.find((candidate) => candidate.id === runId);
    if (!latestRun || latestRun.status !== "실행 중") return;
    for (const [sceneId, prompt] of generated.prompts) {
      const scene = latest.scenes.find((candidate) => candidate.id === sceneId && candidate.video.enabled);
      if (scene) scene.video.input = { ...scene.video.input, prompt };
    }
    const now = new Date().toISOString();
    latestRun.status = "완료";
    latestRun.message = `${generated.prompts.size}개 선택 장면의 영상 프롬프트를 저장했습니다.`;
    latestRun.endedAt = now;
    latest.project.status = "완료";
    latest.project.updatedAt = now;
    await saveProjectDocument(latest);
  } catch (error) {
    const latest = await loadProjectDocument(projectId).catch(() => null);
    if (latest) {
      const run = latest.runs.find((candidate) => candidate.id === runId);
      if (run?.status === "실행 중") {
        run.status = "실패";
        run.message = "기존 이미지 선택과 영상 프롬프트는 유지했습니다.";
        run.errorSummary = error instanceof Error ? error.message : "영상 프롬프트 생성에 실패했습니다.";
        run.endedAt = new Date().toISOString();
        latest.project.status = "실패";
        latest.project.updatedAt = new Date().toISOString();
        await saveProjectDocument(latest).catch(() => undefined);
      }
    }
  } finally {
    activeRuns.delete(key);
  }
}

export async function getVideoPromptGenerationRun(projectId: string, runIdInput: string): Promise<ImageGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-video-prompt-/, ""));
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new ProjectStorageError("READ_FAILED", "영상 프롬프트 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(keyFor(projectId, runId))) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 영상 프롬프트 실행 결과를 확인할 수 없습니다.";
    run.endedAt = new Date().toISOString();
    await saveProjectDocument(project);
  }
  return { runId, status: run.status, project };
}
