import type {
  EditingTimeline,
  ImageMotion,
  ImageMotionType,
  ProjectDocument,
  SceneTransitionType,
  VoiceTimestamp,
} from "./project-schema";

const MIN_CLIP_SECONDS = 0.5;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function transitionMaximum(
  previous: EditingTimeline["sceneClips"][number],
  next: EditingTimeline["sceneClips"][number],
): number {
  return rounded(Math.max(0, Math.min(2, previous.durationSeconds - 0.1, next.durationSeconds - 0.1)));
}

function reflowSceneClips(timeline: EditingTimeline): void {
  let start = 0;
  timeline.sceneClips.forEach((clip, index) => {
    clip.startSeconds = rounded(start);
    const next = timeline.sceneClips[index + 1];
    if (!next) return;
    const transition = timeline.transitions[index];
    if (transition) {
      transition.durationSeconds = transition.type === "none"
        ? 0
        : Math.min(transition.durationSeconds, transitionMaximum(clip, next));
    }
    start += clip.durationSeconds;
  });
}

function markOutputStale(project: ProjectDocument, reason: string): void {
  project.output.status = project.output.assetId ? "확인 필요" : project.output.status;
  project.output.stale = project.output.assetId ? { isStale: true, reason } : project.output.stale;
}

export function imageMotionPreset(type: ImageMotionType, clipDurationSeconds: number): ImageMotion {
  const shared = { startSeconds: 0, durationSeconds: rounded(clipDurationSeconds) };
  if (type === "zoom-out") return { type, start: { xPercent: 50, yPercent: 50, scale: 1.15 }, end: { xPercent: 50, yPercent: 50, scale: 1 }, ...shared };
  if (type === "pan") return { type, start: { xPercent: 0, yPercent: 50, scale: 1.12 }, end: { xPercent: 100, yPercent: 50, scale: 1.12 }, ...shared };
  return { type, start: { xPercent: 50, yPercent: 50, scale: 1 }, end: { xPercent: 50, yPercent: 50, scale: 1.15 }, ...shared };
}

function narrationWeight(text: string): number {
  return Math.max(1, text.replace(/\s/g, "").length);
}

function timestampBoundary(items: readonly VoiceTimestamp[], characterTarget: number): number {
  let characters = 0;
  for (const item of items) {
    const itemWeight = narrationWeight(item.text);
    if (characters + itemWeight >= characterTarget) {
      const progress = Math.max(0, Math.min(1, (characterTarget - characters) / itemWeight));
      return item.startSeconds + (item.endSeconds - item.startSeconds) * progress;
    }
    characters += itemWeight;
  }
  return items.at(-1)?.endSeconds ?? 0;
}

function terminalPunctuation(text: string): string | undefined {
  return text.match(/[.!?,。！？，]/g)?.at(-1);
}

function punctuationBoundaries(
  scenes: readonly ProjectDocument["scenes"][number][],
  timestamps: readonly VoiceTimestamp[],
): Array<number | undefined> {
  let timestampIndex = 0;
  return scenes.slice(0, -1).map((scene) => {
    const punctuation = terminalPunctuation(scene.narration);
    if (!punctuation) return undefined;

    let punctuationIndex = -1;
    for (let index = timestampIndex; index < timestamps.length; index += 1) {
      if (timestamps[index].text.includes(punctuation)) {
        punctuationIndex = index;
        break;
      }
    }
    if (punctuationIndex < 0) return undefined;

    timestampIndex = punctuationIndex + 1;
    const nextSpeech = timestamps
      .slice(timestampIndex)
      .find((item) => item.text.trim().length > 0);
    return nextSpeech?.startSeconds ?? timestamps[punctuationIndex].endSeconds;
  });
}

function narrationSegments(
  project: ProjectDocument,
  durationSeconds: number,
  timestamps: readonly VoiceTimestamp[],
) {
  const scenes = [...project.scenes].sort((left, right) => left.order - right.order);
  const weights = scenes.map((scene) => narrationWeight(scene.narration));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const timestampWeight = timestamps.reduce((sum, item) => sum + narrationWeight(item.text), 0);
  const sentenceBoundaries = punctuationBoundaries(scenes, timestamps);
  let cumulativeWeight = 0;
  let previousEnd = timestamps[0]?.startSeconds ?? 0;
  return scenes.map((scene, index) => {
    cumulativeWeight += weights[index];
    const fallbackEnd = timestamps.length > 0
      ? timestampBoundary(timestamps, Math.round((cumulativeWeight / totalWeight) * timestampWeight))
      : (cumulativeWeight / totalWeight) * durationSeconds;
    const requestedEnd = index === scenes.length - 1 && timestamps.length > 0
      ? timestamps.at(-1)?.endSeconds ?? fallbackEnd
      : sentenceBoundaries[index] ?? fallbackEnd;
    const startSeconds = previousEnd;
    const endSeconds = Math.min(
      durationSeconds,
      Math.max(startSeconds + 0.01, requestedEnd),
    );
    previousEnd = endSeconds;
    return {
      sceneId: scene.id,
      startSeconds: rounded(Math.max(0, startSeconds)),
      endSeconds: rounded(Math.max(startSeconds + 0.01, endSeconds)),
    };
  });
}

export function createSubtitleTrack(
  project: ProjectDocument,
  timeline: Pick<EditingTimeline, "sceneClips" | "narration">,
): EditingTimeline["subtitles"] {
  const segmentByScene = new Map(
    timeline.narration?.segments.map((segment) => [segment.sceneId, segment]) ?? [],
  );
  const clipByScene = new Map(timeline.sceneClips.map((clip) => [clip.sceneId, clip]));
  const cues = [...project.scenes]
    .sort((left, right) => left.order - right.order)
    .flatMap((scene) => {
      const placement = segmentByScene.get(scene.id) ?? clipByScene.get(scene.id);
      if (!placement || !scene.narration.trim()) return [];
      const startSeconds = rounded(placement.startSeconds);
      const endSeconds = rounded(
        "endSeconds" in placement
          ? placement.endSeconds
          : placement.startSeconds + placement.durationSeconds,
      );
      return [{
        id: `subtitle-${scene.id}`,
        sceneId: scene.id,
        text: scene.narration.trim(),
        startSeconds,
        endSeconds: Math.max(startSeconds + 0.01, endSeconds),
      }];
    });
  return {
    enabled: true,
    alignment: timeline.narration?.alignment ?? "estimated",
    style: {
      fontFamily: "sans-serif",
      fontSize: 70,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 3,
      position: "bottom",
    },
    cues,
  };
}

export function createEditingTimeline(project: ProjectDocument): EditingTimeline {
  let sceneStart = 0;
  const sceneClips = [...project.scenes]
    .sort((left, right) => left.order - right.order)
    .flatMap((scene) => {
      const videoAsset = scene.video.selectedAssetId
        ? project.assets.find((asset) => asset.id === scene.video.selectedAssetId && asset.role === "scene-video")
        : undefined;
      const imageAsset = scene.selectedImageAssetId
        ? project.assets.find((asset) => asset.id === scene.selectedImageAssetId && asset.role === "scene-image")
        : undefined;
      const selectedAsset = scene.editing.selectedMedia === "video" && videoAsset ? videoAsset : imageAsset;
      if (!selectedAsset) return [];
      const availableVideoDuration = selectedAsset.kind === "video" ? selectedAsset.metadata.durationSeconds : undefined;
      const requestedDuration = Math.max(MIN_CLIP_SECONDS, scene.editing.durationSeconds);
      const durationSeconds = availableVideoDuration === undefined
        ? requestedDuration
        : Math.max(MIN_CLIP_SECONDS, Math.min(requestedDuration, availableVideoDuration - scene.editing.trimStartSeconds));
      const clip = {
        sceneId: scene.id,
        assetId: selectedAsset.id,
        mediaType: selectedAsset.kind as "image" | "video",
        startSeconds: rounded(sceneStart),
        durationSeconds: rounded(durationSeconds),
        trimStartSeconds: scene.editing.trimStartSeconds,
        imageMotion: null,
      };
      sceneStart += durationSeconds;
      return [clip];
    });

  const voiceAsset = project.assets.find((asset) => asset.id === project.voice.selectedAssetId && asset.role === "narration");
  const voiceTimestamps = project.voice.timestamps.find((entry) => entry.assetId === voiceAsset?.id)?.items ?? [];
  const voiceDuration = voiceAsset?.metadata.durationSeconds ?? voiceTimestamps.at(-1)?.endSeconds ?? sceneStart;
  const narration = voiceAsset && voiceDuration > 0 ? {
    assetId: voiceAsset.id,
    startSeconds: 0,
    endSeconds: rounded(voiceDuration),
    alignment: voiceTimestamps.length > 0 ? "provider-timestamps" as const : "estimated" as const,
    volume: 1,
    segments: narrationSegments(project, voiceDuration, voiceTimestamps),
  } : null;

  const musicAsset = project.assets.find((asset) => asset.id === project.music.selectedAssetId && asset.role === "background-music");
  const musicDuration = musicAsset?.metadata.durationSeconds ?? sceneStart;
  const transitions = sceneClips.slice(1).map((clip, index) => ({
    id: `transition-${clip.sceneId}`,
    fromSceneId: sceneClips[index].sceneId,
    toSceneId: clip.sceneId,
    type: "none" as const,
    durationSeconds: 0,
  }));
  const timelineBase = {
    sceneClips,
    transitions,
    narration,
    music: musicAsset && musicDuration > 0
      ? { assetId: musicAsset.id, startSeconds: 0, endSeconds: rounded(Math.min(musicDuration, sceneStart || musicDuration)), volume: 0.25, fadeInSeconds: 0, fadeOutSeconds: 0 }
      : null,
  };
  return { ...timelineBase, subtitles: createSubtitleTrack(project, timelineBase) };
}

export function syncEditingTimelineAudioSelections(project: ProjectDocument): boolean {
  const timeline = project.editing.timeline;
  if (!timeline) return false;
  const selectedVoiceId = project.voice.selectedAssetId;
  const selectedMusicId = project.music.selectedAssetId;
  const narrationChanged = (timeline.narration?.assetId ?? null) !== selectedVoiceId;
  const musicChanged = (timeline.music?.assetId ?? null) !== selectedMusicId;
  if (!narrationChanged && !musicChanged) return false;

  const refreshed = createEditingTimeline(project);
  if (narrationChanged) {
    const volume = timeline.narration?.volume ?? 1;
    timeline.narration = refreshed.narration
      ? { ...refreshed.narration, volume }
      : null;
    const subtitleStyle = structuredClone(timeline.subtitles.style);
    const subtitlesEnabled = timeline.subtitles.enabled;
    timeline.subtitles = createSubtitleTrack(project, {
      sceneClips: timeline.sceneClips,
      narration: timeline.narration,
    });
    timeline.subtitles.enabled = subtitlesEnabled;
    timeline.subtitles.style = subtitleStyle;
  }
  if (musicChanged) {
    const previous = timeline.music;
    timeline.music = refreshed.music
      ? {
          ...refreshed.music,
          volume: previous?.volume ?? refreshed.music.volume,
          fadeInSeconds: Math.min(previous?.fadeInSeconds ?? 0, refreshed.music.endSeconds - refreshed.music.startSeconds),
          fadeOutSeconds: Math.min(previous?.fadeOutSeconds ?? 0, refreshed.music.endSeconds - refreshed.music.startSeconds),
        }
      : null;
  }
  project.editing.error = null;
  return true;
}

export function timelineDuration(timeline: EditingTimeline): number {
  return Math.max(
    1,
    ...timeline.sceneClips.map((clip) => clip.startSeconds + clip.durationSeconds),
    ...(timeline.narration?.segments.map((segment) => segment.endSeconds) ?? []),
    timeline.narration?.endSeconds ?? 0,
    timeline.music?.endSeconds ?? 0,
    ...timeline.subtitles.cues.map((cue) => cue.endSeconds),
  );
}

export function validateEditingTimeline(
  project: ProjectDocument,
  availableAssetIds?: ReadonlySet<string>,
): string[] {
  const timeline = project.editing.timeline;
  if (!timeline) return [];
  const errors: string[] = [];
  const clipsByScene = new Map(timeline.sceneClips.map((clip) => [clip.sceneId, clip]));
  for (const scene of project.scenes) {
    const clip = clipsByScene.get(scene.id);
    if (!clip) errors.push(`${scene.order}번 장면의 대표 이미지 또는 영상이 없습니다.`);
    else if (availableAssetIds && !availableAssetIds.has(clip.assetId)) errors.push(`${scene.order}번 장면 미디어 파일이 누락되었습니다.`);
  }
  for (const clip of timeline.sceneClips) {
    if (clip.startSeconds < 0 || clip.durationSeconds < MIN_CLIP_SECONDS) errors.push(`${clip.sceneId} 장면의 시간 범위가 올바르지 않습니다.`);
    if (clip.imageMotion && clip.mediaType !== "image") errors.push(`${clip.sceneId} 영상 장면에는 정지 이미지 효과를 적용할 수 없습니다.`);
    if (clip.imageMotion && clip.imageMotion.startSeconds + clip.imageMotion.durationSeconds > clip.durationSeconds + 0.001) errors.push(`${clip.sceneId} 이미지 효과 시간이 장면 길이를 벗어났습니다.`);
  }
  for (const transition of timeline.transitions) {
    const previous = clipsByScene.get(transition.fromSceneId);
    const next = clipsByScene.get(transition.toSceneId);
    if (!previous || !next) {
      errors.push(`${transition.id} 전환의 장면 참조가 올바르지 않습니다.`);
      continue;
    }
    if (transition.durationSeconds > transitionMaximum(previous, next) + 0.001) errors.push(`${transition.id} 전환 시간이 인접 장면보다 깁니다.`);
  }
  if (timeline.narration) {
    if (availableAssetIds && !availableAssetIds.has(timeline.narration.assetId)) errors.push("선택한 전체 더빙 파일이 누락되었습니다.");
    const placementEnd = Math.max(
      timeline.narration.endSeconds,
      ...timeline.narration.segments.map((segment) => segment.endSeconds),
      ...timeline.sceneClips.map(
        (clip) => clip.startSeconds + clip.durationSeconds,
      ),
    );
    for (const segment of timeline.narration.segments) {
      if (segment.startSeconds < 0 || segment.endSeconds > placementEnd || segment.endSeconds <= segment.startSeconds) errors.push(`${segment.sceneId} 내레이션 구간이 타임라인 범위를 벗어났습니다.`);
    }
  }
  if (timeline.music) {
    if (availableAssetIds && !availableAssetIds.has(timeline.music.assetId)) errors.push("선택한 배경음악 파일이 누락되었습니다.");
    const musicDuration = timeline.music.endSeconds - timeline.music.startSeconds;
    if (timeline.music.fadeInSeconds > musicDuration || timeline.music.fadeOutSeconds > musicDuration) errors.push("배경음악 페이드 시간이 음악 길이를 벗어났습니다.");
  }
  const duration = Math.max(
    1,
    ...timeline.sceneClips.map((clip) => clip.startSeconds + clip.durationSeconds),
    ...(timeline.narration?.segments.map((segment) => segment.endSeconds) ?? []),
    timeline.narration?.endSeconds ?? 0,
    timeline.music?.endSeconds ?? 0,
  );
  for (const cue of timeline.subtitles.cues) {
    if (!project.scenes.some((scene) => scene.id === cue.sceneId)) errors.push(`${cue.id} 자막의 장면 참조가 올바르지 않습니다.`);
    if (!cue.text.trim()) errors.push(`${cue.id} 자막 내용이 비어 있습니다.`);
    if (cue.startSeconds < 0 || cue.endSeconds <= cue.startSeconds || cue.endSeconds > duration + 0.001) errors.push(`${cue.id} 자막 구간이 타임라인 범위를 벗어났습니다.`);
  }
  return errors;
}

export function resizeSceneClip(project: ProjectDocument, sceneId: string, durationSeconds: number): ProjectDocument {
  const next = structuredClone(project);
  const timeline = next.editing.timeline;
  if (!timeline) return next;
  const sceneOrder = new Map(next.scenes.map((scene) => [scene.id, scene.order]));
  const ordered = [...timeline.sceneClips].sort((left, right) => (sceneOrder.get(left.sceneId) ?? 0) - (sceneOrder.get(right.sceneId) ?? 0));
  const clip = ordered.find((candidate) => candidate.sceneId === sceneId);
  if (!clip) return next;
  const asset = next.assets.find((candidate) => candidate.id === clip.assetId);
  const maximum = clip.mediaType === "video" && asset?.metadata.durationSeconds !== undefined
    ? asset.metadata.durationSeconds - clip.trimStartSeconds
    : Number.POSITIVE_INFINITY;
  clip.durationSeconds = rounded(Math.max(MIN_CLIP_SECONDS, Math.min(durationSeconds, maximum)));
  if (clip.imageMotion) {
    clip.imageMotion.startSeconds = Math.min(clip.imageMotion.startSeconds, Math.max(0, clip.durationSeconds - 0.1));
    clip.imageMotion.durationSeconds = rounded(Math.min(clip.imageMotion.durationSeconds, clip.durationSeconds - clip.imageMotion.startSeconds));
  }
  timeline.sceneClips = ordered;
  reflowSceneClips(timeline);
  for (const candidate of ordered) {
    const scene = next.scenes.find((item) => item.id === candidate.sceneId);
    if (scene) {
      scene.startSeconds = candidate.startSeconds;
      scene.durationSeconds = candidate.durationSeconds;
      scene.editing.durationSeconds = candidate.durationSeconds;
    }
  }
  const visualDuration = Math.max(0, ...ordered.map((candidate) => candidate.startSeconds + candidate.durationSeconds));
  next.project.settings.targetDurationSeconds = rounded(visualDuration);
  next.script.targetDurationSeconds = rounded(visualDuration);
  markOutputStale(next, "타임라인 장면 길이 변경");
  return next;
}

export function updateSceneTransition(
  project: ProjectDocument,
  transitionId: string,
  type: SceneTransitionType,
  durationSeconds: number,
): ProjectDocument {
  const next = structuredClone(project);
  const timeline = next.editing.timeline;
  const transition = timeline?.transitions.find((candidate) => candidate.id === transitionId);
  if (!timeline || !transition) return next;
  const previous = timeline.sceneClips.find((clip) => clip.sceneId === transition.fromSceneId);
  const following = timeline.sceneClips.find((clip) => clip.sceneId === transition.toSceneId);
  if (!previous || !following) return next;
  transition.type = type;
  transition.durationSeconds = type === "none"
    ? 0
    : rounded(Math.max(0.1, Math.min(durationSeconds, transitionMaximum(previous, following))));
  reflowSceneClips(timeline);
  for (const clip of timeline.sceneClips) {
    const scene = next.scenes.find((candidate) => candidate.id === clip.sceneId);
    if (scene) scene.startSeconds = clip.startSeconds;
  }
  markOutputStale(next, "장면 전환 변경");
  return next;
}

export function updateImageMotion(
  project: ProjectDocument,
  sceneId: string,
  imageMotion: ImageMotion | null,
): ProjectDocument {
  const next = structuredClone(project);
  const clip = next.editing.timeline?.sceneClips.find((candidate) => candidate.sceneId === sceneId);
  if (!clip || clip.mediaType !== "image") return next;
  clip.imageMotion = imageMotion;
  markOutputStale(next, "정지 이미지 효과 변경");
  return next;
}

export function moveNarrationSegment(project: ProjectDocument, sceneId: string, startSeconds: number): ProjectDocument {
  const next = structuredClone(project);
  const timeline = next.editing.timeline;
  const narration = timeline?.narration;
  const segment = narration?.segments.find((candidate) => candidate.sceneId === sceneId);
  if (!timeline || !narration || !segment) return next;
  const duration = segment.endSeconds - segment.startSeconds;
  const placementEnd = Math.max(
    narration.endSeconds,
    ...timeline.sceneClips.map(
      (clip) => clip.startSeconds + clip.durationSeconds,
    ),
  );
  const clampedStart = Math.max(
    0,
    Math.min(startSeconds, placementEnd - duration),
  );
  segment.startSeconds = rounded(clampedStart);
  segment.endSeconds = rounded(clampedStart + duration);
  const cue = timeline.subtitles.cues.find((candidate) => candidate.sceneId === sceneId);
  if (cue) {
    cue.startSeconds = segment.startSeconds;
    cue.endSeconds = segment.endSeconds;
  }
  markOutputStale(next, "내레이션 구간 이동");
  return next;
}
