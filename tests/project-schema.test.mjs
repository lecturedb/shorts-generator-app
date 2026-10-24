import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProjectValidationError, parseProjectDocument } from "../lib/project-schema.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

function cloneFixture() {
  return structuredClone(fixture);
}

test("샘플 project.json의 모든 도메인과 참조를 검증한다", () => {
  const project = parseProjectDocument(cloneFixture());

  assert.equal(project.schemaVersion, 3);
  assert.equal(project.workflow.steps.length, 6);
  assert.equal(project.scenes.length, 7);
  assert.equal(project.scenes[0].video.endImageAssetId, "asset-image-scene-02");
  assert.equal(project.scenes[5].video.mode, "start_only");
  assert.equal(project.script.text.includes("실제 우주"), true);
});

test("스키마 v1 프로젝트를 자료 손실 없이 최신 읽기 모델로 변환한다", () => {
  const source = cloneFixture();
  const legacy = {
    schemaVersion: 1,
    project: { ...source.project, settings: { ...source.project.settings } },
    workflow: source.workflow,
    script: {
      title: source.script.topic,
      hook: "",
      narration: source.script.text,
      targetDurationSeconds: source.script.targetDurationSeconds,
      stale: source.script.stale,
    },
    scenes: source.scenes.map((scene) => ({
      id: scene.id,
      order: scene.order,
      narration: scene.narration,
      prompt: scene.image.input.prompt,
      durationSeconds: scene.durationSeconds,
      assetIds: scene.assetIds,
      stale: scene.stale,
    })),
    assets: source.assets,
    runs: source.runs,
    output: source.output,
  };
  delete legacy.project.settings.fps;

  const migrated = parseProjectDocument(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.scenes.length, 7);
  assert.equal(migrated.script.text, source.script.text);
  assert.equal(migrated.scenes[0].selectedImageAssetId, "asset-image-scene-01");
});

test("필수값 누락을 거부한다", () => {
  const project = cloneFixture();
  delete project.project.id;

  assert.throws(() => parseProjectDocument(project), ProjectValidationError);
});

test("지원하지 않는 상태를 거부한다", () => {
  const project = cloneFixture();
  project.scenes[0].image.status = "알 수 없음";

  assert.throws(() => parseProjectDocument(project), /지원하지 않는 .*상태/);
});

test("프로젝트 밖을 가리키는 상대 경로를 거부한다", () => {
  const project = cloneFixture();
  project.assets[0].relativePath = "../outside.png";

  assert.throws(() => parseProjectDocument(project), /프로젝트 내부의 정규화된 상대 경로/);
});

test("존재하지 않는 장면과 자산 참조를 거부한다", () => {
  const missingScene = cloneFixture();
  missingScene.assets[0].sceneId = "scene-99";
  assert.throws(() => parseProjectDocument(missingScene), /존재하지 않는 장면/);

  const missingAsset = cloneFixture();
  missingAsset.output.assetId = "asset-missing";
  assert.throws(() => parseProjectDocument(missingAsset), /존재하지 않는 자산/);
});

test("단계 설정에 API 키를 저장하지 못하게 한다", () => {
  const project = cloneFixture();
  project.workflow.steps[0].settings.openaiApiKey = "secret";

  assert.throws(() => parseProjectDocument(project), /API 키나 비밀값/);
});
