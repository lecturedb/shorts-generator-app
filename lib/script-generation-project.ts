import type { ProjectDocument } from "./project-schema";
import type { ScriptGenerationInput, ScriptGenerationResult } from "./script-generation-types";

function requiredStep(project: ProjectDocument, stageId: ProjectDocument["workflow"]["steps"][number]["id"]) {
  const step = project.workflow.steps.find((candidate) => candidate.id === stageId);
  if (!step) throw new Error(`제작 단계 '${stageId}'을 찾을 수 없습니다.`);
  return step;
}

function updateDownstreamStatus(
  project: ProjectDocument,
  stageId: "image" | "video" | "voice" | "music" | "editing",
) {
  const step = requiredStep(project, stageId);
  const hasResult = stageId === "image"
    ? project.assets.some((asset) => asset.stageId === "image")
    : stageId === "video"
      ? project.assets.some((asset) => asset.stageId === "video")
      : stageId === "voice"
        ? project.voice.assetIds.length > 0
        : stageId === "music"
          ? project.music.assetIds.length > 0
          : project.output.assetId !== null;
  step.status = hasResult ? "확인 필요" : "대기";
  step.summary = hasResult ? "대본 변경으로 확인 필요" : "실행 전";
}

export function applyGeneratedScriptResult(
  project: ProjectDocument,
  input: ScriptGenerationInput,
  model: string,
  result: ScriptGenerationResult,
  runId: string,
  now = new Date().toISOString(),
): ProjectDocument {
  const next = structuredClone(project);
  const generatedSceneIds = new Set(result.scenes.map((scene) => `scene-${String(scene.order).padStart(2, "0")}`));
  next.assets = next.assets.map((asset) => ({
    ...asset,
    ...(asset.sceneId && !generatedSceneIds.has(asset.sceneId) ? { sceneId: undefined } : {}),
    stale: { isStale: true, reason: "대본·장면 구성이 변경되었습니다." },
  }));
  next.runs = next.runs.map((run) => ({
    ...run,
    ...(run.sceneId && !generatedSceneIds.has(run.sceneId) ? { sceneId: undefined } : {}),
  }));
  next.script = {
    provider: "openai",
    model,
    topic: input.topic,
    text: result.script,
    targetDurationSeconds: input.targetDurationSeconds,
    stale: { isStale: false },
  };
  next.scenes = result.scenes.map((scene) => {
    const id = `scene-${String(scene.order).padStart(2, "0")}`;
    const existingAssets = next.assets.filter((asset) => asset.sceneId === id).map((asset) => asset.id);
    const existingImage = next.assets.find((asset) => asset.sceneId === id && asset.role === "scene-image" && asset.selected);
    return {
      id,
      order: scene.order,
      startSeconds: scene.startSeconds,
      durationSeconds: scene.durationSeconds,
      narration: scene.narration,
      visual: scene.visual,
      assetIds: existingAssets,
      selectedImageAssetId: existingImage?.id ?? null,
      image: {
        endpoint: "fal-ai/recraft/v3/text-to-image",
        input: { prompt: scene.imagePrompt, image_size: "portrait_16_9", style: "realistic_image" },
        status: existingImage ? "확인 필요" as const : "대기" as const,
        error: null,
      },
      video: {
        enabled: false,
        mode: null,
        startImageAssetId: null,
        endImageAssetId: null,
        endpoint: null,
        input: {},
        status: "대기" as const,
        selectedAssetId: null,
        error: null,
      },
      editing: { selectedMedia: "image" as const, durationSeconds: scene.durationSeconds, trimStartSeconds: 0 },
      stale: { isStale: false },
    };
  });
  next.project.settings.targetDurationSeconds = input.targetDurationSeconds;
  next.project.updatedAt = now;
  next.project.status = "완료";
  const step = requiredStep(next, "script");
  step.status = "완료";
  step.summary = `${result.scenes.length}개 장면 구성 완료`;
  step.settings = { tone: input.tone, sceneCount: input.sceneCount };
  updateDownstreamStatus(next, "image");
  updateDownstreamStatus(next, "video");
  updateDownstreamStatus(next, "voice");
  updateDownstreamStatus(next, "music");
  updateDownstreamStatus(next, "editing");
  next.voice.status = next.voice.assetIds.length > 0 ? "확인 필요" : "대기";
  next.music.status = next.music.assetIds.length > 0 ? "확인 필요" : "대기";
  next.editing.status = next.output.assetId ? "확인 필요" : "대기";
  next.output.status = next.output.assetId ? "확인 필요" : "대기";
  next.output.stale = next.output.assetId
    ? { isStale: true, reason: "대본·장면 구성이 변경되었습니다." }
    : { isStale: false };
  const run = next.runs.find((candidate) => candidate.id === runId);
  if (run) {
    run.status = "완료";
    run.message = `${result.scenes.length}개 장면과 이미지 프롬프트를 생성했습니다.`;
    run.endedAt = now;
    delete run.errorSummary;
  }
  return next;
}
