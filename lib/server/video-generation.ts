import "server-only";

import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import { applyVideoConfiguration, videoGenerationSceneIds } from "../video-generation-project";
import type { VideoConfigurationAction, VideoGenerationRunResult } from "../video-generation-types";
import { generateVideoWithFal } from "./fal-video-generation";
import { listProjects } from "./project-management";
import {
  loadProjectDocument,
  ProjectStorageError,
  resolveExistingProjectFilePath,
  resolveProjectFilePath,
  saveProjectDocument,
} from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveVideoRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveVideoRuns ??= new Set<string>();

function runKey(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function videoStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "video");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "영상 생성 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown): string {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) {
    throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  }
  return `run-video-${requestId}`;
}

function imageAsset(project: ProjectDocument, assetId: string | null, label: string) {
  const asset = project.assets.find((candidate) => candidate.id === assetId && candidate.role === "scene-image");
  if (!asset) throw new Error(`${label} 이미지 자산을 찾을 수 없습니다.`);
  return asset;
}

function validateScene(project: ProjectDocument, sceneId: string) {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene?.video.enabled) throw new Error("영상 대상으로 선택한 장면이 아닙니다.");
  const prompt = scene.video.input.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error(`${scene.order}번 장면의 영상 프롬프트가 비어 있습니다.`);
  imageAsset(project, scene.video.startImageAssetId, "시작");
  if (scene.video.mode === "start_end") imageAsset(project, scene.video.endImageAssetId, "끝");
  return scene;
}

function videoType(contentType: string) {
  if (contentType.includes("webm")) return { extension: "webm", format: "WEBM" };
  return { extension: "mp4", format: "MP4" };
}

async function downloadVideo(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3 * 60_000) });
  if (!response.ok) throw new Error("생성 영상을 프로젝트로 다운로드하지 못했습니다.");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_VIDEO_BYTES) throw new Error("생성 영상이 허용 크기를 초과했습니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("생성 영상 파일 크기가 올바르지 않습니다.");
  const contentType = response.headers.get("content-type")?.split(";")[0].trim() || "video/mp4";
  if (!contentType.startsWith("video/")) throw new Error("다운로드 결과가 영상 형식이 아닙니다.");
  return { bytes, contentType };
}

async function writeVideoAtomically(projectId: string, relativePath: string, bytes: Uint8Array) {
  const destination = resolveProjectFilePath(projectId, relativePath);
  const temporary = path.join(path.dirname(destination), `.video-${randomUUID()}.tmp`);
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

export async function startVideoGeneration(
  projectId: string,
  requestId: unknown,
  sceneIdsInput: unknown,
): Promise<VideoGenerationRunResult & { created: boolean }> {
  const runId = runIdFor(requestId);
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  let sceneIds: string[];
  try {
    sceneIds = videoGenerationSceneIds(project, sceneIdsInput);
  } catch (error) {
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "생성할 장면 ID 목록이 올바르지 않습니다.");
  }
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(key)) return { runId, status: "실행 중", project, created: false };
  if (sceneIds.length === 0) throw new ProjectStorageError("WRITE_FAILED", "영상 생성 대상으로 선택한 장면이 없습니다.");
  for (const sceneId of sceneIds) validateScene(project, sceneId);

  const now = new Date().toISOString();
  project.runs.push({
    id: runId,
    stageId: "video",
    label: sceneIds.length === 1 ? "fal.ai 장면 영상 생성" : "fal.ai 선택 장면 영상 생성",
    status: "실행 중",
    message: `${sceneIds.length}개 선택 장면의 영상을 생성하고 있습니다.`,
    startedAt: now,
    resultAssetIds: [],
  });
  for (const scene of project.scenes) {
    if (sceneIds.includes(scene.id)) {
      scene.video.status = "요청 중";
      scene.video.error = null;
    }
  }
  const step = videoStep(project);
  step.status = "실행 중";
  step.summary = `${sceneIds.length}개 선택 장면 생성 중`;
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

export async function performVideoGeneration(projectId: string, runId: string, sceneIdsInput: unknown): Promise<void> {
  const key = runKey(projectId, runId);
  try {
    let project = await loadProjectDocument(projectId);
    const sceneIds = videoGenerationSceneIds(project, sceneIdsInput);
    const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "video");
    if (!run || run.status !== "실행 중") return;

    for (const sceneId of sceneIds) {
      project = await loadProjectDocument(projectId);
      const scene = project.scenes.find((candidate) => candidate.id === sceneId);
      const currentRun = project.runs.find((candidate) => candidate.id === runId);
      if (!scene || currentRun?.status !== "실행 중") return;
      scene.video.status = "처리 중";
      await saveProjectDocument(project);
      try {
        validateScene(project, sceneId);
        const startAsset = imageAsset(project, scene.video.startImageAssetId, "시작");
        const endAsset = scene.video.mode === "start_end" ? imageAsset(project, scene.video.endImageAssetId, "끝") : null;
        const startImagePath = await resolveExistingProjectFilePath(projectId, startAsset.relativePath);
        const endImagePath = endAsset ? await resolveExistingProjectFilePath(projectId, endAsset.relativePath) : undefined;
        if (!startImagePath) throw new Error("시작 이미지 파일이 없습니다. 이미지를 복구하거나 다시 생성해 주세요.");
        if (endAsset && !endImagePath) throw new Error("끝 이미지 파일이 없습니다. 이미지를 복구하거나 다시 생성해 주세요.");
        const prompt = scene.video.input.prompt as string;
        const generated = await generateVideoWithFal({ prompt, durationSeconds: scene.durationSeconds, startImagePath, endImagePath: endImagePath ?? undefined });
        const downloaded = await downloadVideo(generated.video.url);
        const type = videoType(downloaded.contentType || generated.video.contentType);
        const assetId = `asset-video-${scene.id}-${randomUUID()}`;
        const relativePath = `videos/${scene.id}-${Date.now()}-${randomUUID().slice(0, 8)}.${type.extension}`;
        await writeVideoAtomically(projectId, relativePath, downloaded.bytes);

        project = await loadProjectDocument(projectId);
        const latestScene = project.scenes.find((candidate) => candidate.id === sceneId);
        const latestRun = project.runs.find((candidate) => candidate.id === runId);
        if (!latestScene || latestRun?.status !== "실행 중") return;
        const firstCandidate = latestScene.video.selectedAssetId === null;
        const sourceAssetIds = [latestScene.video.startImageAssetId, latestScene.video.endImageAssetId].filter((id): id is string => id !== null);
        project.assets.push({
          id: assetId,
          label: `${latestScene.order}번 장면 영상 후보 ${project.assets.filter((asset) => asset.sceneId === sceneId && asset.role === "scene-video").length + 1}`,
          kind: "video",
          role: "scene-video",
          stageId: "video",
          sceneId,
          relativePath,
          createdAt: new Date().toISOString(),
          selected: firstCandidate,
          sourceAssetIds,
          stale: { isStale: false },
          metadata: {
            format: type.format,
            ...(generated.video.width ? { width: generated.video.width } : {}),
            ...(generated.video.height ? { height: generated.video.height } : {}),
            durationSeconds: generated.video.durationSeconds ?? latestScene.durationSeconds,
          },
        });
        latestScene.assetIds.push(assetId);
        if (firstCandidate) {
          latestScene.video.selectedAssetId = assetId;
          latestScene.editing.selectedMedia = "video";
        }
        latestScene.video.endpoint = generated.model;
        latestScene.video.input = { prompt, duration: latestScene.durationSeconds, generate_audio: false, audio: false };
        latestScene.video.status = "완료";
        latestScene.video.error = null;
        latestRun.resultAssetIds.push(assetId);
        await saveProjectDocument(project);
      } catch (error) {
        project = await loadProjectDocument(projectId);
        const failedScene = project.scenes.find((candidate) => candidate.id === sceneId);
        if (failedScene) {
          failedScene.video.status = "실패";
          failedScene.video.error = error instanceof Error ? error.message : "영상 생성에 실패했습니다.";
        }
        await saveProjectDocument(project).catch(() => undefined);
      }
    }

    project = await loadProjectDocument(projectId);
    const completedRun = project.runs.find((candidate) => candidate.id === runId);
    if (!completedRun || completedRun.status !== "실행 중") return;
    const failedCount = sceneIds.filter((sceneId) => project.scenes.find((scene) => scene.id === sceneId)?.video.status === "실패").length;
    const now = new Date().toISOString();
    completedRun.status = failedCount ? "실패" : "완료";
    completedRun.message = failedCount
      ? `${sceneIds.length - failedCount}개 완료, ${failedCount}개 실패했습니다. 기존 영상과 다른 장면 결과는 유지했습니다.`
      : `${sceneIds.length}개 선택 장면의 영상을 생성하고 프로젝트에 저장했습니다.`;
    if (failedCount) completedRun.errorSummary = `${failedCount}개 장면의 영상 생성에 실패했습니다.`;
    completedRun.endedAt = now;
    const enabledScenes = project.scenes.filter((scene) => scene.video.enabled);
    const completedCount = enabledScenes.filter((scene) => scene.video.status === "완료").length;
    const step = videoStep(project);
    step.status = failedCount ? "실패" : (completedCount === enabledScenes.length ? "완료" : "확인 필요");
    step.summary = `선택 영상 ${completedCount}/${enabledScenes.length} 완료`;
    step.settings = { provider: "fal.ai", model: process.env.FAL_VIDEO_MODEL?.trim() || "설정 필요", audio: false };
    project.project.status = failedCount ? "실패" : "완료";
    project.project.updatedAt = now;
    await saveProjectDocument(project);
  } finally {
    activeRuns.delete(key);
  }
}

export async function getVideoGenerationRun(projectId: string, runIdInput: string): Promise<VideoGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-video-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "video");
  if (!run) throw new ProjectStorageError("READ_FAILED", "영상 생성 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(key)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 실행 결과 확인이 필요합니다. 완료된 영상과 기존 후보는 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    videoStep(project).status = "확인 필요";
    for (const scene of project.scenes) {
      if (scene.video.status === "요청 중" || scene.video.status === "처리 중") scene.video.status = "확인 필요";
    }
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function updateVideoConfiguration(projectId: string, rawAction: unknown) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) {
    throw new ProjectStorageError("WRITE_FAILED", "영상 설정 요청이 올바르지 않습니다.");
  }
  const action = rawAction as VideoConfigurationAction;
  if (action.action !== "select-video" || typeof action.sceneId !== "string" || typeof action.assetId !== "string") {
    throw new ProjectStorageError("WRITE_FAILED", "영상 후보 선택 정보가 올바르지 않습니다.");
  }
  try {
    return await saveProjectDocument(applyVideoConfiguration(await loadProjectDocument(projectId), action));
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "영상 설정을 저장하지 못했습니다.", { cause: error });
  }
}

export async function videoProjectSummaries() {
  return (await listProjects()).projects;
}
