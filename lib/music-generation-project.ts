import { syncEditingTimelineAudioSelections } from "./editing-timeline.ts";
import type { MusicConfigurationAction, MusicGenerationInput } from "./music-generation-types";
import { musicInputSettings } from "./music-generation-validation.ts";
import type { ProjectDocument } from "./project-schema";

function musicStep(project: ProjectDocument) {
  return project.workflow.steps.find((step) => step.id === "music");
}

function staleMusic(project: ProjectDocument, reason: string) {
  for (const asset of project.assets) {
    if (asset.role === "background-music") asset.stale = { isStale: true, reason };
  }
  if (project.music.assetIds.length > 0) project.music.status = "확인 필요";
  const step = musicStep(project);
  if (step && project.music.assetIds.length > 0) {
    step.status = "확인 필요";
    step.summary = reason;
  }
  if (project.output.assetId) {
    project.output.status = "확인 필요";
    project.output.stale = { isStale: true, reason };
    project.editing.status = "확인 필요";
  }
}

export function applyMusicSettings(project: ProjectDocument, input: MusicGenerationInput, now = new Date().toISOString()) {
  const next = structuredClone(project);
  const previousDuration = next.project.settings.targetDurationSeconds;
  const durationChanged = input.durationSeconds !== previousDuration;
  next.project.settings.targetDurationSeconds = input.durationSeconds;
  next.script.targetDurationSeconds = input.durationSeconds;
  const settings = musicInputSettings(input);
  if (durationChanged) staleMusic(next, "프로젝트 목표 길이가 변경되었습니다.");
  else if (JSON.stringify(next.music.input) !== JSON.stringify(settings)) staleMusic(next, "배경음악 설정이 변경되었습니다.");
  next.music.input = settings;
  const step = musicStep(next);
  if (step) step.settings = { ...settings };
  next.project.updatedAt = now;
  return next;
}

export function markMusicStaleForDurationChange(project: ProjectDocument, previousDuration: number) {
  if (project.project.settings.targetDurationSeconds !== previousDuration) {
    staleMusic(project, "프로젝트 목표 길이가 변경되었습니다.");
  }
  return project;
}

export function applyMusicConfiguration(project: ProjectDocument, action: MusicConfigurationAction, now = new Date().toISOString()): ProjectDocument {
  if (action.action === "update-settings") return applyMusicSettings(project, action.input, now);
  const next = structuredClone(project);
  const selected = next.assets.find((asset) => asset.id === action.assetId && asset.role === "background-music" && next.music.assetIds.includes(asset.id));
  if (!selected) throw new Error("선택할 음악 후보를 찾을 수 없습니다.");
  for (const asset of next.assets) {
    if (asset.role === "background-music") asset.selected = asset.id === selected.id;
  }
  next.music.selectedAssetId = selected.id;
  syncEditingTimelineAudioSelections(next);
  next.music.status = selected.stale.isStale ? "확인 필요" : "완료";
  next.music.error = null;
  const step = musicStep(next);
  if (step) {
    step.status = selected.stale.isStale ? "확인 필요" : "완료";
    step.summary = `대표 음악: ${selected.label}`;
  }
  if (next.output.assetId) {
    next.output.status = "확인 필요";
    next.output.stale = { isStale: true, reason: "대표 배경음악이 변경되었습니다." };
    next.editing.status = "확인 필요";
  }
  next.project.updatedAt = now;
  return next;
}

export function editingMusicInput(project: ProjectDocument) {
  const asset = project.assets.find((candidate) => candidate.id === project.music.selectedAssetId && candidate.role === "background-music");
  return {
    assetId: asset?.id ?? null,
    relativePath: asset?.relativePath ?? null,
    label: asset?.label ?? null,
    targetDurationSeconds: project.project.settings.targetDurationSeconds,
    needsReview: asset?.stale.isStale ?? false,
  };
}
