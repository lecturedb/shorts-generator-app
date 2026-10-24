import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createEditingTimeline, imageMotionPreset, moveNarrationSegment, resizeSceneClip, updateImageMotion, updateSceneTransition, validateEditingTimeline } from "../lib/editing-timeline.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

function projectWithAudio({ timestamps = [] } = {}) {
  const source = structuredClone(fixture);
  const now = "2026-10-23T00:00:00.000Z";
  source.assets.push(
    { id: "asset-voice-test", label: "전체 더빙", kind: "audio", role: "narration", stageId: "voice", relativePath: "audio/narration/test.mp3", createdAt: now, selected: true, sourceAssetIds: [], stale: { isStale: false }, metadata: { format: "MP3", durationSeconds: 42 } },
    { id: "asset-music-test", label: "배경음악", kind: "audio", role: "background-music", stageId: "music", relativePath: "audio/music/test.mp3", createdAt: now, selected: true, sourceAssetIds: [], stale: { isStale: false }, metadata: { format: "MP3", durationSeconds: 60 } },
  );
  source.voice.assetIds = ["asset-voice-test"];
  source.voice.selectedAssetId = "asset-voice-test";
  source.voice.timestamps = timestamps.length ? [{ assetId: "asset-voice-test", items: timestamps }] : [];
  source.music.assetIds = ["asset-music-test"];
  source.music.selectedAssetId = "asset-music-test";
  return parseProjectDocument(source);
}

test("대표 장면 미디어와 선택한 더빙·음악으로 타임라인을 구성한다", () => {
  const project = projectWithAudio();
  const timeline = createEditingTimeline(project);
  assert.equal(timeline.sceneClips.length, project.scenes.length);
  assert.equal(timeline.narration?.alignment, "estimated");
  assert.equal(timeline.narration?.endSeconds, 42);
  assert.equal(timeline.narration?.segments.length, project.scenes.length);
  assert.equal(timeline.narration?.volume, 1);
  assert.equal(timeline.music?.endSeconds, 45);
  assert.equal(timeline.music?.volume, 0.25);
  assert.equal(timeline.transitions.length, project.scenes.length - 1);
});

test("전환은 장면 길이와 조정한 내레이션 절대 위치를 유지한다", () => {
  const project = projectWithAudio();
  project.editing.timeline = createEditingTimeline(project);
  const moved = moveNarrationSegment(project, "scene-01", 2);
  const narrationBefore = structuredClone(moved.editing.timeline.narration.segments);
  const clipsBefore = structuredClone(moved.editing.timeline.sceneClips);
  const transitioned = updateSceneTransition(moved, "transition-scene-02", "dissolve", 1);

  assert.deepEqual(transitioned.editing.timeline.sceneClips, clipsBefore);
  assert.deepEqual(transitioned.editing.timeline.narration.segments, narrationBefore);
  assert.equal(transitioned.editing.timeline.transitions[0].type, "dissolve");
});

test("기존 겹침 방식으로 저장된 전환 타임라인을 순차 장면 배치로 복원한다", () => {
  const project = projectWithAudio();
  project.editing.timeline = createEditingTimeline(project);
  project.editing.timeline.transitions[0].type = "dissolve";
  project.editing.timeline.transitions[0].durationSeconds = 1;
  for (let index = 1; index < project.editing.timeline.sceneClips.length; index += 1) {
    const previous = project.editing.timeline.sceneClips[index - 1];
    const transition = project.editing.timeline.transitions[index - 1];
    project.editing.timeline.sceneClips[index].startSeconds =
      previous.startSeconds + previous.durationSeconds - transition.durationSeconds;
  }

  const restored = parseProjectDocument(project);

  assert.equal(restored.editing.timeline.sceneClips[1].startSeconds, 5);
  assert.equal(restored.scenes[1].startSeconds, 5);
  assert.equal(restored.editing.timeline.transitions[0].durationSeconds, 1);
});

test("정지 이미지 모션과 오디오 효과 설정을 스키마가 보존한다", () => {
  const project = projectWithAudio();
  project.editing.timeline = createEditingTimeline(project);
  const withMotion = updateImageMotion(project, "scene-01", imageMotionPreset("zoom-in", 5));
  withMotion.editing.timeline.narration.volume = 0.8;
  withMotion.editing.timeline.music.volume = 0.2;
  withMotion.editing.timeline.music.fadeInSeconds = 1.5;
  withMotion.editing.timeline.music.fadeOutSeconds = 2;

  const parsed = parseProjectDocument(withMotion);
  assert.equal(parsed.editing.timeline.sceneClips[0].imageMotion.type, "zoom-in");
  assert.equal(parsed.editing.timeline.narration.volume, 0.8);
  assert.equal(parsed.editing.timeline.music.fadeOutSeconds, 2);
});

test("기존 v2 타임라인의 음량 설정을 v3 효과 구조로 이관한다", () => {
  const source = projectWithAudio();
  source.editing.timeline = createEditingTimeline(source);
  source.schemaVersion = 2;
  source.output.settings.narrationVolume = 0.7;
  source.output.settings.musicVolume = 0.15;
  delete source.editing.timeline.transitions;
  for (const clip of source.editing.timeline.sceneClips) delete clip.imageMotion;
  delete source.editing.timeline.narration.volume;
  delete source.editing.timeline.music.volume;
  delete source.editing.timeline.music.fadeInSeconds;
  delete source.editing.timeline.music.fadeOutSeconds;

  const migrated = parseProjectDocument(source);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.editing.timeline.transitions.length, migrated.scenes.length - 1);
  assert.equal(migrated.editing.timeline.narration.volume, 0.7);
  assert.equal(migrated.editing.timeline.music.volume, 0.15);
});

test("공급자 타임스탬프를 대사 분량 추정보다 우선한다", () => {
  const project = projectWithAudio({ timestamps: [
    { text: "첫 번째 구간", startSeconds: 1, endSeconds: 5 },
    { text: "두 번째 구간과 나머지 대본", startSeconds: 5, endSeconds: 38 },
  ] });
  const timeline = createEditingTimeline(project);
  assert.equal(timeline.narration?.alignment, "provider-timestamps");
  assert.equal(timeline.narration?.segments[0].startSeconds, 1);
  assert.equal(timeline.narration?.segments.at(-1).endSeconds, 38);
});

test("로마자 음소 타임스탬프도 장면 문장부호 뒤에서 분할한다", () => {
  const punctuationTimestamps = [];
  let time = 0;
  const scenes = [...fixture.scenes].sort((left, right) => left.order - right.order);
  const expectedBoundaries = [];
  for (const [index, scene] of scenes.entries()) {
    punctuationTimestamps.push({
      text: `romanized-scene-${index + 1}`,
      startSeconds: time,
      endSeconds: time + 1,
    });
    const punctuation = scene.narration.trim().at(-1);
    punctuationTimestamps.push({
      text: punctuation,
      startSeconds: time + 1,
      endSeconds: time + 1.1,
    });
    punctuationTimestamps.push({
      text: " ",
      startSeconds: time + 1.1,
      endSeconds: time + 1.5,
    });
    time += 1.5;
    expectedBoundaries.push(time);
  }

  const project = projectWithAudio({ timestamps: punctuationTimestamps });
  const segments = createEditingTimeline(project).narration?.segments ?? [];
  assert.deepEqual(
    segments.map((segment) => segment.endSeconds),
    expectedBoundaries,
  );
});

test("장면 길이 조정은 이후 장면을 재배치하고 내레이션 이동은 장면 타임라인으로 제한한다", () => {
  const project = projectWithAudio();
  project.editing.timeline = createEditingTimeline(project);
  const resized = resizeSceneClip(project, "scene-01", 7);
  assert.equal(resized.editing.timeline?.sceneClips[0].durationSeconds, 7);
  assert.equal(resized.editing.timeline?.sceneClips[1].startSeconds, 7);
  const moved = moveNarrationSegment(resized, "scene-01", 100);
  const timelineEnd = Math.max(
    ...resized.editing.timeline.sceneClips.map(
      (clip) => clip.startSeconds + clip.durationSeconds,
    ),
    resized.editing.timeline.narration.endSeconds,
  );
  assert.equal(
    moved.editing.timeline?.narration?.segments[0].endSeconds,
    timelineEnd,
  );

  const lastSegment = resized.editing.timeline?.narration?.segments.at(-1);
  assert.ok(lastSegment);
  const movedLast = moveNarrationSegment(
    resized,
    lastSegment.sceneId,
    lastSegment.startSeconds - 2,
  );
  assert.equal(
    movedLast.editing.timeline?.narration?.segments.at(-1)?.startSeconds,
    lastSegment.startSeconds - 2,
  );
});

test("누락 미디어와 잘못된 저장 시간 범위를 검증한다", () => {
  const project = projectWithAudio();
  project.editing.timeline = createEditingTimeline(project);
  const available = new Set(project.assets.map((asset) => asset.id));
  available.delete("asset-image-scene-01");
  assert.match(validateEditingTimeline(project, available).join(" "), /미디어 파일이 누락/);

  const invalid = structuredClone(project);
  invalid.editing.timeline.narration.segments[0].endSeconds = invalid.editing.timeline.narration.segments[0].startSeconds;
  assert.throws(() => parseProjectDocument(invalid), /시작 시간보다 커야/);
});
