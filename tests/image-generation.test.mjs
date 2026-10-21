import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyImageConfiguration } from "../lib/image-generation-project.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);

async function fixture() {
  return parseProjectDocument(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

test("대표 이미지 변경은 그 이미지를 참조하는 영상 결과만 확인 필요로 만든다", async () => {
  const project = await fixture();
  const candidate = structuredClone(project.assets.find((asset) => asset.id === "asset-image-scene-01"));
  candidate.id = "asset-image-scene-01-candidate-2";
  candidate.label = "1번 장면 이미지 후보 2";
  candidate.relativePath = "images/scene-01-candidate-2.webp";
  candidate.selected = false;
  project.assets.push(candidate);
  project.scenes[0].assetIds.push(candidate.id);
  project.scenes[0].video.status = "완료";
  project.scenes[5].video.status = "완료";

  const updated = applyImageConfiguration(project, {
    action: "select-image",
    sceneId: "scene-01",
    assetId: candidate.id,
  }, "2026-10-21T01:00:00.000Z");

  assert.equal(updated.scenes[0].selectedImageAssetId, candidate.id);
  assert.equal(updated.scenes[0].video.status, "확인 필요");
  assert.equal(updated.scenes[5].video.status, "완료");
  assert.equal(updated.assets.find((asset) => asset.id === candidate.id)?.selected, true);
  assert.doesNotThrow(() => parseProjectDocument(updated));
});

test("영상 대상 해제 시 생성 정보와 이미지 참조를 비운다", async () => {
  const project = await fixture();
  const updated = applyImageConfiguration(project, {
    action: "set-video-plan",
    sceneId: "scene-01",
    enabled: false,
    mode: null,
    startImageAssetId: null,
    endImageAssetId: null,
  });
  assert.deepEqual(updated.scenes[0].video.input, {});
  assert.equal(updated.scenes[0].video.startImageAssetId, null);
  assert.equal(updated.scenes[0].video.endImageAssetId, null);
  assert.doesNotThrow(() => parseProjectDocument(updated));
});

test("다른 장면의 대표 이미지를 끝 이미지로 선택할 수 있다", async () => {
  const project = await fixture();
  const updated = applyImageConfiguration(project, {
    action: "set-video-plan",
    sceneId: "scene-01",
    enabled: true,
    mode: "start_end",
    startImageAssetId: "asset-image-scene-01",
    endImageAssetId: "asset-image-scene-02",
  });
  assert.equal(updated.scenes[0].video.endImageAssetId, "asset-image-scene-02");
  assert.doesNotThrow(() => parseProjectDocument(updated));
});
