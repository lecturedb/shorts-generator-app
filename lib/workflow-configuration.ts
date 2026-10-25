import type { ProjectDocument, WorkflowStepId } from "./project-schema";

export const fixedWorkflowOrder: readonly WorkflowStepId[] = [
  "script",
  "image",
  "video",
  "voice",
  "music",
  "editing",
];

export function workflowStep(project: ProjectDocument, stageId: WorkflowStepId) {
  return project.workflow.steps.find((step) => step.id === stageId);
}

export function assertWorkflowStepIncluded(project: ProjectDocument, stageId: WorkflowStepId): void {
  const step = workflowStep(project, stageId);
  if (!step) throw new Error(`제작 단계 '${stageId}'을 찾을 수 없습니다.`);
  if (!step.included) throw new Error(`${step.label} 단계가 현재 워크플로에서 제외되어 있어 실행할 수 없습니다.`);
}

export function workflowInputBlockers(project: ProjectDocument, stageId: WorkflowStepId): string[] {
  const blockers: string[] = [];
  const step = workflowStep(project, stageId);
  if (!step?.included) return [`${step?.label ?? stageId} 단계가 워크플로에서 제외되어 있습니다.`];

  if (stageId === "image" && project.scenes.length === 0) {
    blockers.push("대본·장면 구성 결과가 없습니다.");
  }
  if (stageId === "video") {
    const targets = project.scenes.filter((scene) => scene.video.enabled);
    if (targets.length === 0) blockers.push("영상화 대상으로 선택한 장면이 없습니다.");
    if (targets.some((scene) => !scene.video.startImageAssetId)) blockers.push("영상 시작 이미지가 없는 장면이 있습니다.");
  }
  if (stageId === "voice" && !project.script.text.trim()) {
    blockers.push("더빙에 사용할 전체 대본이 없습니다.");
  }
  if (stageId === "editing") {
    if (project.scenes.length === 0) blockers.push("편집할 장면이 없습니다.");
    const missingMedia = project.scenes.filter((scene) => {
      const selectedId = scene.editing.selectedMedia === "video"
        ? scene.video.selectedAssetId
        : scene.selectedImageAssetId;
      return !selectedId || !project.assets.some((asset) => asset.id === selectedId);
    });
    if (missingMedia.length > 0) {
      blockers.push(`${missingMedia.map((scene) => `${scene.order}번`).join(", ")} 장면의 편집용 이미지 또는 영상이 없습니다.`);
    }
  }
  return blockers;
}

export function applyVideoDefaults(project: ProjectDocument): void {
  const videoStep = workflowStep(project, "video");
  const enabled = videoStep?.settings.enabledByDefault === true;
  const mode = videoStep?.settings.modeByDefault === "start_end" ? "start_end" : "start_only";
  if (!enabled) return;
  for (const scene of project.scenes) {
    if (!scene.selectedImageAssetId) continue;
    scene.video.enabled = true;
    scene.video.mode = mode;
    scene.video.startImageAssetId = scene.selectedImageAssetId;
    scene.video.endImageAssetId = mode === "start_end" ? scene.selectedImageAssetId : null;
  }
}
