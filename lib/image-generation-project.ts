import type { ImageConfigurationAction } from "./image-generation-types";
import type { ProjectDocument } from "./project-schema";

function sceneById(project: ProjectDocument, sceneId: string) {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error("장면을 찾을 수 없습니다.");
  return scene;
}

function imageAsset(project: ProjectDocument, assetId: string) {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.role !== "scene-image") throw new Error("장면 이미지 자산을 찾을 수 없습니다.");
  return asset;
}

function markReferencedVideosStale(project: ProjectDocument, assetId: string, reason: string) {
  for (const scene of project.scenes) {
    if (scene.video.startImageAssetId !== assetId && scene.video.endImageAssetId !== assetId) continue;
    if (scene.video.selectedAssetId || scene.video.status === "완료") scene.video.status = "확인 필요";
    scene.video.error = reason;
    for (const asset of project.assets) {
      if (asset.role === "scene-video" && asset.sceneId === scene.id) {
        asset.stale = { isStale: true, reason };
      }
    }
  }
}

export function applyImageConfiguration(
  project: ProjectDocument,
  action: ImageConfigurationAction,
  now = new Date().toISOString(),
): ProjectDocument {
  const next = structuredClone(project);
  const scene = sceneById(next, action.sceneId);

  if (action.action === "select-image") {
    const selected = imageAsset(next, action.assetId);
    if (selected.sceneId !== scene.id) throw new Error("해당 장면의 이미지 후보만 대표 이미지로 선택할 수 있습니다.");
    const previousId = scene.selectedImageAssetId;
    for (const asset of next.assets) {
      if (asset.role === "scene-image" && asset.sceneId === scene.id) asset.selected = asset.id === selected.id;
    }
    scene.selectedImageAssetId = selected.id;
    scene.image.status = "완료";
    scene.image.error = null;
    if (previousId && previousId !== selected.id) {
      markReferencedVideosStale(next, previousId, "참조 이미지가 변경되었습니다.");
    }
  } else if (action.action === "set-video-plan") {
    if (!action.enabled) {
      scene.video = {
        enabled: false,
        mode: null,
        startImageAssetId: null,
        endImageAssetId: null,
        endpoint: null,
        input: {},
        status: "대기",
        selectedAssetId: null,
        error: null,
      };
    } else {
      if (action.mode === null || action.startImageAssetId === null) throw new Error("영상화할 장면에는 시작 이미지와 모드가 필요합니다.");
      imageAsset(next, action.startImageAssetId);
      if (action.mode === "start_end") {
        if (action.endImageAssetId === null) throw new Error("시작·끝 영상에는 끝 이미지가 필요합니다.");
        imageAsset(next, action.endImageAssetId);
      }
      const referencesChanged = scene.video.startImageAssetId !== action.startImageAssetId
        || scene.video.endImageAssetId !== action.endImageAssetId
        || scene.video.mode !== action.mode;
      scene.video.enabled = true;
      scene.video.mode = action.mode;
      scene.video.startImageAssetId = action.startImageAssetId;
      scene.video.endImageAssetId = action.mode === "start_end" ? action.endImageAssetId : null;
      scene.video.endpoint = null;
      if (referencesChanged) {
        scene.video.input = {};
        scene.video.status = scene.video.selectedAssetId ? "확인 필요" : "대기";
        scene.video.error = scene.video.selectedAssetId ? "영상 입력 이미지가 변경되었습니다." : null;
      }
    }
  } else {
    if (!scene.video.enabled) throw new Error("영상 생성 대상으로 선택한 장면만 영상 프롬프트를 저장할 수 있습니다.");
    const prompt = action.prompt.trim();
    if (!prompt) throw new Error("영상 프롬프트를 입력해 주세요.");
    if (prompt.length > 4_000) throw new Error("영상 프롬프트는 4,000자 이하여야 합니다.");
    scene.video.input = { ...scene.video.input, prompt };
  }

  next.project.updatedAt = now;
  return next;
}

