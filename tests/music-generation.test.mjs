import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createEditingTimeline } from "../lib/editing-timeline.ts";
import { applyMusicConfiguration, applyMusicSettings, editingMusicInput } from "../lib/music-generation-project.ts";
import { parseMusicGenerationInput, falMusicInput } from "../lib/music-generation-validation.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);

async function fixture() {
  return parseProjectDocument(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

function addMusicCandidate(project, id = "asset-music-candidate-01", selected = true) {
  project.assets.push({
    id,
    label: id.endsWith("02") ? "배경음악 후보 2" : "배경음악 후보 1",
    kind: "audio",
    role: "background-music",
    stageId: "music",
    relativePath: `audio/${id}.mp3`,
    createdAt: "2026-10-22T00:00:00.000Z",
    selected,
    sourceAssetIds: [],
    stale: { isStale: false },
    metadata: { format: "MP3", durationSeconds: 30 },
  });
  project.music.assetIds.push(id);
  if (selected) project.music.selectedAssetId = id;
  return project.assets.at(-1);
}

const settings = {
  durationSeconds: 30,
  mood: "따뜻하고 희망적",
  prompt: "Cinematic electronic background music",
  negativePrompt: "vocals, distortion",
  instrumental: true,
  promptExpansion: true,
  inferenceSteps: 8,
  guidanceScale: 1,
  bitrate: "192k",
};

test("음악 설정을 검증하고 모델별 공식 fal.ai 입력 키로 변환한다", () => {
  assert.deepEqual(parseMusicGenerationInput(settings), settings);
  assert.deepEqual(falMusicInput("fal-ai/stable-audio-3/small/music/text-to-audio", settings, 30), {
    prompt: "따뜻하고 희망적. Cinematic electronic background music. Instrumental only, no vocals, no lyrics.",
    negative_prompt: "vocals, distortion",
    duration: 30,
    num_inference_steps: 8,
    guidance_scale: 1,
    enable_prompt_expansion: true,
    enable_safety_checker: true,
    output_format: "mp3",
    bitrate: "192k",
  });
  assert.deepEqual(falMusicInput("fal-ai/elevenlabs/music", settings, 30), {
    prompt: "따뜻하고 희망적. Cinematic electronic background music. Instrumental only, no vocals, no lyrics.",
    music_length_ms: 30_000,
    force_instrumental: true,
    output_format: "mp3_44100_192",
  });
  assert.deepEqual(falMusicInput("fal-ai/stable-audio-25/text-to-audio", settings, 45), {
    prompt: "따뜻하고 희망적. Cinematic electronic background music. Instrumental only, no vocals, no lyrics.",
    seconds_total: 45,
    num_inference_steps: 8,
    guidance_scale: 1,
    enable_safety_checker: true,
  });
  assert.doesNotThrow(() => falMusicInput("fal-ai/stable-audio-3/medium/text-to-audio", settings, 180));
  assert.throws(() => falMusicInput("fal-ai/stable-audio-3/small/music/text-to-audio", settings, 121), /최대|3~120/);
  assert.throws(() => parseMusicGenerationInput({ ...settings, bitrate: "500k" }), /비트레이트/);
  assert.throws(() => parseMusicGenerationInput({ ...settings, durationSeconds: 9 }), /음악 길이/);
  assert.throws(() => parseMusicGenerationInput({ ...settings, durationSeconds: 30.5 }), /정수/);
});

test("음악 설정과 목표 길이 변경은 기존 음악만 확인 필요로 만들고 파일 참조를 보존한다", async () => {
  const project = await fixture();
  addMusicCandidate(project);
  const imageState = project.assets.filter((asset) => asset.role === "scene-image").map((asset) => [asset.id, asset.stale]);
  const musicAsset = project.assets.find((asset) => asset.role === "background-music");
  assert.ok(musicAsset);
  const relativePath = musicAsset.relativePath;
  const configured = applyMusicSettings(project, { ...settings, durationSeconds: project.project.settings.targetDurationSeconds }, "2026-10-22T00:00:00.000Z");
  assert.equal(configured.music.status, "확인 필요");
  assert.equal(configured.assets.find((asset) => asset.id === musicAsset.id)?.relativePath, relativePath);
  assert.deepEqual(configured.assets.filter((asset) => asset.role === "scene-image").map((asset) => [asset.id, asset.stale]), imageState);
  const durationChanged = applyMusicSettings(configured, { ...settings, durationSeconds: 61 }, "2026-10-22T00:01:00.000Z");
  assert.equal(durationChanged.project.settings.targetDurationSeconds, 61);
  assert.equal(durationChanged.script.targetDurationSeconds, 61);
  assert.equal(durationChanged.music.input.target_duration_seconds, 61);
  assert.equal(durationChanged.assets.find((asset) => asset.id === musicAsset.id)?.stale.isStale, true);
  assert.equal(durationChanged.workflow.steps.find((step) => step.id === "music")?.summary, "프로젝트 목표 길이가 변경되었습니다.");
  assert.doesNotThrow(() => parseProjectDocument(durationChanged));
});

test("대표 음악 선택과 최종 편집 입력 연결은 이미지·영상·더빙 선택을 변경하지 않는다", async () => {
  const project = await fixture();
  addMusicCandidate(project);
  project.editing.timeline = createEditingTimeline(project);
  assert.ok(project.editing.timeline.music);
  project.editing.timeline.music.volume = 0.4;
  project.editing.timeline.music.fadeInSeconds = 1;
  project.editing.timeline.music.fadeOutSeconds = 2;
  const unaffected = project.assets.filter((asset) => asset.role !== "background-music").map((asset) => [asset.id, asset.selected]);
  const second = addMusicCandidate(project, "asset-music-candidate-02", false);
  second.relativePath = "audio/music-02.mp3";
  const updated = applyMusicConfiguration(project, { action: "select-music", assetId: "asset-music-candidate-02" }, "2026-10-22T00:00:00.000Z");
  assert.deepEqual(updated.assets.filter((asset) => asset.role !== "background-music").map((asset) => [asset.id, asset.selected]), unaffected);
  assert.deepEqual(editingMusicInput(updated), {
    assetId: "asset-music-candidate-02",
    relativePath: "audio/music-02.mp3",
    label: "배경음악 후보 2",
    targetDurationSeconds: updated.project.settings.targetDurationSeconds,
    needsReview: false,
  });
  assert.equal(updated.editing.timeline?.music?.assetId, "asset-music-candidate-02");
  assert.equal(updated.editing.timeline?.music?.volume, 0.4);
  assert.equal(updated.editing.timeline?.music?.fadeInSeconds, 1);
  assert.equal(updated.editing.timeline?.music?.fadeOutSeconds, 2);
  assert.doesNotThrow(() => parseProjectDocument(updated));
});
