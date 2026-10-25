import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createEditingTimeline } from "../lib/editing-timeline.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";
import { normalizeFalVoiceTimestamps } from "../lib/server/fal-voice-timestamps.ts";
import { applyVoiceConfiguration } from "../lib/voice-generation-project.ts";
import { parseVoiceGenerationInput, voiceInputSettings } from "../lib/voice-generation-validation.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);

async function fixture() {
  return parseProjectDocument(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

const settings = {
  voice: "Rachel",
  languageCode: "ko",
  speed: 1,
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  textNormalization: "auto",
  timestamps: true,
};

test("fal.ai 음성 설정의 지원 범위를 검증하고 API 입력 키로 변환한다", () => {
  assert.deepEqual(parseVoiceGenerationInput(settings), settings);
  assert.deepEqual(voiceInputSettings(settings), {
    voice: "Rachel",
    language_code: "ko",
    speed: 1,
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0,
    apply_text_normalization: "auto",
    timestamps: true,
  });
  assert.throws(() => parseVoiceGenerationInput({ ...settings, speed: 1.3 }), /0.7~1.2/);
  assert.throws(() => parseVoiceGenerationInput({ ...settings, languageCode: "kor" }), /언어 코드/);
});

test("fal.ai timestamps 내부의 문자 alignment를 프로젝트 시간 형식으로 변환한다", () => {
  assert.deepEqual(normalizeFalVoiceTimestamps({
    timestamps: [{
      characters: [" ", "a", "n"],
      character_start_times_seconds: [0, 0.1, 0.2],
      character_end_times_seconds: [0.1, 0.2, 0.35],
    }],
  }), [
    { text: " ", startSeconds: 0, endSeconds: 0.1 },
    { text: "a", startSeconds: 0.1, endSeconds: 0.2 },
    { text: "n", startSeconds: 0.2, endSeconds: 0.35 },
  ]);
});

test("기존 직접 timestamp와 최상위 alignment 응답도 계속 변환한다", () => {
  assert.deepEqual(normalizeFalVoiceTimestamps({
    timestamps: [{ word: "안녕", start: 0, end: 0.5 }],
  }), [{ text: "안녕", startSeconds: 0, endSeconds: 0.5 }]);

  assert.deepEqual(normalizeFalVoiceTimestamps({
    alignment: {
      characters: ["안"],
      character_start_times_seconds: [0],
      character_end_times_seconds: [0.25],
    },
  }), [{ text: "안", startSeconds: 0, endSeconds: 0.25 }]);
});

test("더빙 후보 선택은 이미지와 영상 자산을 변경하지 않는다", async () => {
  const project = await fixture();
  const imageSelections = project.assets.filter((asset) => asset.role === "scene-image").map((asset) => [asset.id, asset.selected]);
  project.assets.push({
    id: "asset-voice-candidate-01",
    label: "전체 더빙 후보 1",
    kind: "audio",
    role: "narration",
    stageId: "voice",
    relativePath: "audio/narration-01.mp3",
    createdAt: "2026-10-22T00:00:00.000Z",
    selected: true,
    sourceAssetIds: [],
    stale: { isStale: false },
    metadata: { format: "MP3", durationSeconds: 45 },
  });
  project.voice.assetIds.push("asset-voice-candidate-01");
  project.voice.selectedAssetId = "asset-voice-candidate-01";
  project.editing.timeline = createEditingTimeline(project);
  assert.ok(project.editing.timeline.narration);
  project.editing.timeline.narration.volume = 0.63;
  project.assets.push({
    id: "asset-voice-candidate-02",
    label: "전체 더빙 후보 2",
    kind: "audio",
    role: "narration",
    stageId: "voice",
    relativePath: "audio/narration-02.mp3",
    createdAt: "2026-10-22T00:00:00.000Z",
    selected: false,
    sourceAssetIds: [],
    stale: { isStale: false },
    metadata: { format: "MP3", durationSeconds: 45 },
  });
  project.voice.assetIds.push("asset-voice-candidate-02");
  project.voice.timestamps.push({
    assetId: "asset-voice-candidate-02",
    items: [{ text: "안녕", startSeconds: 0, endSeconds: 45 }],
  });

  const updated = applyVoiceConfiguration(project, { action: "select-voice", assetId: "asset-voice-candidate-02" }, "2026-10-22T00:00:00.000Z");
  assert.equal(updated.voice.selectedAssetId, "asset-voice-candidate-02");
  assert.equal(updated.editing.timeline?.narration?.assetId, "asset-voice-candidate-02");
  assert.equal(updated.editing.timeline?.narration?.volume, 0.63);
  assert.equal(updated.editing.timeline?.subtitles.alignment, "provider-timestamps");
  assert.deepEqual(updated.assets.filter((asset) => asset.role === "scene-image").map((asset) => [asset.id, asset.selected]), imageSelections);
  assert.doesNotThrow(() => parseProjectDocument(updated));
});

test("기존 schemaVersion 2 프로젝트는 타임스탬프 필드 없이도 안전하게 읽는다", async () => {
  const source = JSON.parse(await readFile(fixtureUrl, "utf8"));
  delete source.voice.timestamps;
  assert.deepEqual(parseProjectDocument(source).voice.timestamps, []);
});
