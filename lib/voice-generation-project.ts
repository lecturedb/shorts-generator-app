import type { ProjectDocument } from "./project-schema";
import type { VoiceConfigurationAction } from "./voice-generation-types";

export function applyVoiceConfiguration(
  project: ProjectDocument,
  action: VoiceConfigurationAction,
  now = new Date().toISOString(),
): ProjectDocument {
  const next = structuredClone(project);
  if (action.action !== "select-voice") throw new Error("지원하지 않는 더빙 설정입니다.");
  const selected = next.assets.find(
    (asset) => asset.id === action.assetId && asset.role === "narration" && next.voice.assetIds.includes(asset.id),
  );
  if (!selected) throw new Error("선택할 더빙 후보를 찾을 수 없습니다.");
  for (const asset of next.assets) {
    if (asset.role === "narration") asset.selected = asset.id === selected.id;
  }
  next.voice.selectedAssetId = selected.id;
  next.voice.status = selected.stale.isStale ? "확인 필요" : "완료";
  next.voice.error = null;
  const step = next.workflow.steps.find((candidate) => candidate.id === "voice");
  if (step) {
    step.status = selected.stale.isStale ? "확인 필요" : "완료";
    step.summary = `대표 더빙: ${selected.label}`;
  }
  if (next.output.assetId) {
    next.output.status = "확인 필요";
    next.output.stale = { isStale: true, reason: "대표 더빙이 변경되었습니다." };
    next.editing.status = "확인 필요";
  }
  next.project.updatedAt = now;
  return next;
}
