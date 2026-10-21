import "server-only";

import { randomUUID } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";

import type { ImageConfigurationAction, ImageGenerationRunResult } from "../image-generation-types";
import { applyImageConfiguration } from "../image-generation-project";
import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import { generateImageWithFal } from "./fal-image-generation";
import { listProjects } from "./project-management";
import {
  loadProjectDocument,
  ProjectStorageError,
  resolveProjectFilePath,
  saveProjectDocument,
} from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveImageRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveImageRuns ??= new Set<string>();

function runKey(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function imageStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "image");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "이미지 생성 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown): string {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) {
    throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  }
  return `run-image-${requestId}`;
}

function requestedSceneIds(project: ProjectDocument, input: unknown): string[] {
  if (input === undefined || input === null) return project.scenes.map((scene) => scene.id);
  if (!Array.isArray(input) || input.length === 0 || input.some((id) => typeof id !== "string")) {
    throw new ProjectStorageError("WRITE_FAILED", "생성할 장면 ID 목록이 올바르지 않습니다.");
  }
  const unique = [...new Set(input as string[])];
  if (unique.some((id) => !project.scenes.some((scene) => scene.id === id))) {
    throw new ProjectStorageError("WRITE_FAILED", "존재하지 않는 장면은 생성할 수 없습니다.");
  }
  return unique;
}

function extensionFor(contentType: string) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return { extension: "jpg", format: "JPEG" };
  if (contentType.includes("webp")) return { extension: "webp", format: "WEBP" };
  return { extension: "png", format: "PNG" };
}

async function downloadImage(url: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("생성 이미지를 프로젝트로 다운로드하지 못했습니다.");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("생성 이미지가 허용 크기를 초과했습니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("생성 이미지 파일 크기가 올바르지 않습니다.");
  const contentType = response.headers.get("content-type")?.split(";")[0].trim() || "image/png";
  if (!contentType.startsWith("image/")) throw new Error("다운로드 결과가 이미지 형식이 아닙니다.");
  return { bytes, contentType };
}

async function writeImageAtomically(projectId: string, relativePath: string, bytes: Uint8Array) {
  const destination = resolveProjectFilePath(projectId, relativePath);
  const temporary = path.join(path.dirname(destination), `.image-${randomUUID()}.tmp`);
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

export async function startImageGeneration(
  projectId: string,
  requestId: unknown,
  sceneIdsInput: unknown,
): Promise<ImageGenerationRunResult & { created: boolean }> {
  const runId = runIdFor(requestId);
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const sceneIds = requestedSceneIds(project, sceneIdsInput);
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(key)) return { runId, status: "실행 중", project, created: false };
  if (project.scenes.length === 0) throw new ProjectStorageError("WRITE_FAILED", "먼저 대본과 장면 구성을 생성해 주세요.");
  for (const sceneId of sceneIds) {
    const scene = project.scenes.find((candidate) => candidate.id === sceneId)!;
    if (typeof scene.image.input.prompt !== "string" || !scene.image.input.prompt.trim()) {
      throw new ProjectStorageError("WRITE_FAILED", `${scene.order}번 장면의 이미지 프롬프트가 비어 있습니다.`);
    }
  }

  const now = new Date().toISOString();
  project.runs.push({
    id: runId,
    stageId: "image",
    label: sceneIds.length === project.scenes.length ? "fal.ai 전체 장면 이미지 생성" : "fal.ai 장면 이미지 재생성",
    status: "실행 중",
    message: `${sceneIds.length}개 장면의 이미지를 생성하고 있습니다.`,
    startedAt: now,
    resultAssetIds: [],
  });
  for (const scene of project.scenes) {
    if (sceneIds.includes(scene.id)) {
      scene.image.status = "요청 중";
      scene.image.error = null;
    }
  }
  const step = imageStep(project);
  step.status = "실행 중";
  step.summary = `${sceneIds.length}개 장면 생성 중`;
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

export async function performImageGeneration(projectId: string, runId: string, sceneIdsInput: unknown): Promise<void> {
  const key = runKey(projectId, runId);
  try {
    let project = await loadProjectDocument(projectId);
    const sceneIds = requestedSceneIds(project, sceneIdsInput);
    const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "image");
    if (!run || run.status !== "실행 중") return;

    for (const sceneId of sceneIds) {
      project = await loadProjectDocument(projectId);
      const scene = project.scenes.find((candidate) => candidate.id === sceneId);
      const currentRun = project.runs.find((candidate) => candidate.id === runId);
      if (!scene || currentRun?.status !== "실행 중") return;
      scene.image.status = "처리 중";
      await saveProjectDocument(project);
      try {
        const prompt = scene.image.input.prompt;
        if (typeof prompt !== "string") throw new Error("이미지 프롬프트가 없습니다.");
        const generated = await generateImageWithFal(prompt);
        const downloaded = await downloadImage(generated.image.url);
        const type = extensionFor(downloaded.contentType || generated.image.contentType);
        const assetId = `asset-image-${scene.id}-${randomUUID()}`;
        const relativePath = `images/${scene.id}-${Date.now()}-${randomUUID().slice(0, 8)}.${type.extension}`;
        await writeImageAtomically(projectId, relativePath, downloaded.bytes);
        project = await loadProjectDocument(projectId);
        const latestScene = project.scenes.find((candidate) => candidate.id === sceneId);
        const latestRun = project.runs.find((candidate) => candidate.id === runId);
        if (!latestScene || latestRun?.status !== "실행 중") return;
        const firstCandidate = latestScene.selectedImageAssetId === null;
        project.assets.push({
          id: assetId,
          label: `${latestScene.order}번 장면 이미지 후보 ${project.assets.filter((asset) => asset.sceneId === sceneId && asset.role === "scene-image").length + 1}`,
          kind: "image",
          role: "scene-image",
          stageId: "image",
          sceneId,
          relativePath,
          createdAt: new Date().toISOString(),
          selected: firstCandidate,
          sourceAssetIds: [],
          stale: { isStale: false },
          metadata: {
            format: type.format,
            ...(generated.image.width ? { width: generated.image.width } : {}),
            ...(generated.image.height ? { height: generated.image.height } : {}),
          },
        });
        latestScene.assetIds.push(assetId);
        if (firstCandidate) latestScene.selectedImageAssetId = assetId;
        latestScene.image.endpoint = generated.model;
        latestScene.image.input = {
          prompt,
          image_size: "portrait_16_9",
          num_images: 1,
          output_format: "png",
        };
        latestScene.image.status = "완료";
        latestScene.image.error = null;
        latestRun.resultAssetIds.push(assetId);
        await saveProjectDocument(project);
      } catch (error) {
        project = await loadProjectDocument(projectId);
        const failedScene = project.scenes.find((candidate) => candidate.id === sceneId);
        if (failedScene) {
          failedScene.image.status = "실패";
          failedScene.image.error = error instanceof Error ? error.message : "이미지 생성에 실패했습니다.";
        }
        await saveProjectDocument(project).catch(() => undefined);
      }
    }

    project = await loadProjectDocument(projectId);
    const completedRun = project.runs.find((candidate) => candidate.id === runId);
    if (!completedRun || completedRun.status !== "실행 중") return;
    const failedCount = sceneIds.filter((sceneId) => project.scenes.find((scene) => scene.id === sceneId)?.image.status === "실패").length;
    const now = new Date().toISOString();
    completedRun.status = failedCount ? "실패" : "완료";
    completedRun.message = failedCount
      ? `${sceneIds.length - failedCount}개 완료, ${failedCount}개 실패했습니다. 완료된 결과는 유지했습니다.`
      : `${sceneIds.length}개 장면 이미지를 생성하고 프로젝트에 저장했습니다.`;
    if (failedCount) completedRun.errorSummary = `${failedCount}개 장면의 이미지 생성에 실패했습니다.`;
    completedRun.endedAt = now;
    const step = imageStep(project);
    const completedCount = project.scenes.filter((scene) => scene.image.status === "완료").length;
    step.status = failedCount ? "실패" : (completedCount === project.scenes.length ? "완료" : "확인 필요");
    step.summary = `이미지 ${completedCount}/${project.scenes.length} 완료`;
    step.settings = { provider: "fal.ai", model: process.env.FAL_IMAGE_MODEL?.trim() || "설정 필요" };
    project.project.status = failedCount ? "실패" : "완료";
    project.project.updatedAt = now;
    await saveProjectDocument(project);
  } finally {
    activeRuns.delete(key);
  }
}

export async function getImageGenerationRun(projectId: string, runIdInput: string): Promise<ImageGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-image-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "image");
  if (!run) throw new ProjectStorageError("READ_FAILED", "이미지 생성 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(key)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 실행 결과 확인이 필요합니다. 완료된 이미지와 기존 후보는 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    imageStep(project).status = "확인 필요";
    for (const scene of project.scenes) {
      if (scene.image.status === "요청 중" || scene.image.status === "처리 중") scene.image.status = "확인 필요";
    }
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function updateImageConfiguration(projectId: string, rawAction: unknown) {
  if (typeof rawAction !== "object" || rawAction === null || Array.isArray(rawAction)) {
    throw new ProjectStorageError("WRITE_FAILED", "이미지 설정 요청이 올바르지 않습니다.");
  }
  const action = rawAction as ImageConfigurationAction;
  if (!action.action || typeof action.sceneId !== "string") {
    throw new ProjectStorageError("WRITE_FAILED", "이미지 설정 작업과 장면 ID가 필요합니다.");
  }
  try {
    return await saveProjectDocument(applyImageConfiguration(await loadProjectDocument(projectId), action));
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("WRITE_FAILED", error instanceof Error ? error.message : "이미지 설정을 저장하지 못했습니다.", { cause: error });
  }
}

export async function imageProjectSummaries() {
  return (await listProjects()).projects;
}
