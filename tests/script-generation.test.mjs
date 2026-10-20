import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyGeneratedScriptResult } from "../lib/script-generation-project.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";
import {
  parseScriptGenerationInput,
  parseScriptGenerationResult,
} from "../lib/script-generation-validation.ts";

const settings = {
  topic: "우주에서는 소리가 들릴까?",
  targetDurationSeconds: 10,
  sceneCount: 2,
  tone: "친근한 설명체",
};
const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);

function validResult() {
  return {
    script: "첫 번째 내레이션 두 번째 내레이션",
    scenes: [
      {
        order: 1,
        startSeconds: 0,
        durationSeconds: 4,
        narration: "첫 번째 내레이션",
        visual: "첫 번째 시각 설명",
        imagePrompt: "First vertical 9:16 image, no text",
      },
      {
        order: 2,
        startSeconds: 4,
        durationSeconds: 6,
        narration: "두 번째 내레이션",
        visual: "두 번째 시각 설명",
        imagePrompt: "Second vertical 9:16 image, no text",
      },
    ],
  };
}

test("대본 생성 입력 범위와 문자열을 검증한다", () => {
  assert.deepEqual(parseScriptGenerationInput(settings), settings);
  assert.throws(
    () => parseScriptGenerationInput({ ...settings, sceneCount: 0 }),
    /장면 수/,
  );
  assert.throws(
    () => parseScriptGenerationInput({ ...settings, targetDurationSeconds: 10.5 }),
    /정수/,
  );
});

test("장면 순서·연속 시간·총 길이와 전체 대본 일치를 검증한다", () => {
  const parsed = parseScriptGenerationResult(validResult(), settings);
  assert.equal(parsed.scenes.length, 2);
  assert.equal(parsed.script, "첫 번째 내레이션 두 번째 내레이션");

  const wrongStart = validResult();
  wrongStart.scenes[1].startSeconds = 5;
  assert.throws(() => parseScriptGenerationResult(wrongStart, settings), /시작 시간/);

  const wrongScript = validResult();
  wrongScript.script = "서로 다른 전체 대본";
  assert.throws(() => parseScriptGenerationResult(wrongScript, settings), /내레이션이 일치/);
});

test("요청 장면 수와 다른 응답을 거부한다", () => {
  const result = validResult();
  result.scenes.pop();
  assert.throws(() => parseScriptGenerationResult(result, settings), /정확히 2개/);
});

test("시각적 내용이 한국어가 아니면 거부한다", () => {
  const result = validResult();
  result.scenes[0].visual = "A glowing creature in the deep ocean";
  assert.throws(
    () => parseScriptGenerationResult(result, settings),
    /시각적 내용.*한국어/,
  );
});

test("생성 결과는 영상 계획을 비우고 기존 자산은 오래된 상태로 보존한다", async () => {
  const project = parseProjectDocument(JSON.parse(await readFile(fixtureUrl, "utf8")));
  const runId = "run-script-test-request";
  project.runs.push({
    id: runId,
    stageId: "script",
    label: "테스트 생성",
    status: "실행 중",
    message: "생성 중",
    startedAt: "2026-10-21T00:00:00.000Z",
    resultAssetIds: [],
  });
  const beforeAssetCount = project.assets.length;
  const updated = applyGeneratedScriptResult(
    project,
    settings,
    "gpt-5.4-mini",
    parseScriptGenerationResult(validResult(), settings),
    runId,
    "2026-10-21T00:01:00.000Z",
  );
  const validated = parseProjectDocument(updated);

  assert.equal(validated.scenes.length, 2);
  assert.equal(validated.assets.length, beforeAssetCount);
  assert.equal(validated.assets.every((asset) => asset.stale.isStale), true);
  assert.equal(validated.scenes.every((scene) => !scene.video.enabled), true);
  assert.equal(validated.scenes.every((scene) => scene.video.endpoint === null), true);
  assert.equal(validated.scenes.every((scene) => Object.keys(scene.video.input).length === 0), true);
  assert.equal(validated.runs.find((run) => run.id === runId)?.status, "완료");
});
