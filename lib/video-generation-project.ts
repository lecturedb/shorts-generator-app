import type { ProjectDocument } from "./project-schema";
import type { VideoConfigurationAction } from "./video-generation-types";

export function videoGenerationSceneIds(project: ProjectDocument, input: unknown): string[] {
  const enabledIds = project.scenes.filter((scene) => scene.video.enabled).map((scene) => scene.id);
  if (input === undefined || input === null) return enabledIds;
  if (!Array.isArray(input) || input.length === 0 || input.some((id) => typeof id !== "string")) {
    throw new Error("생성할 장면 ID 목록이 올바르지 않습니다.");
  }
  const unique = [...new Set(input as string[])];
  if (unique.some((id) => !enabledIds.includes(id))) throw new Error("영상 대상으로 선택한 장면만 생성할 수 있습니다.");
  return unique;
}

export function applyVideoConfiguration(
  project: ProjectDocument,
  action: VideoConfigurationAction,
  now = new Date().toISOString(),
): ProjectDocument {
  const next = structuredClone(project);
  const scene = next.scenes.find((candidate) => candidate.id === action.sceneId);
  if (!scene) throw new Error("장면을 찾을 수 없습니다.");
  if (!scene.video.enabled) throw new Error("영상 생성 대상으로 선택한 장면만 영상 후보를 선택할 수 있습니다.");
  const asset = next.assets.find((candidate) => candidate.id === action.assetId);
  if (!asset || asset.role !== "scene-video" || asset.sceneId !== scene.id) {
    throw new Error("해당 장면의 영상 후보만 선택할 수 있습니다.");
  }

  for (const candidate of next.assets) {
    if (candidate.role === "scene-video" && candidate.sceneId === scene.id) {
      candidate.selected = candidate.id === asset.id;
    }
  }
  scene.video.selectedAssetId = asset.id;
  scene.video.status = asset.stale.isStale ? "확인 필요" : "완료";
  scene.video.error = asset.stale.isStale ? (asset.stale.reason ?? "영상 결과를 확인해 주세요.") : null;
  scene.editing.selectedMedia = "video";
  next.project.updatedAt = now;
  return next;
}
