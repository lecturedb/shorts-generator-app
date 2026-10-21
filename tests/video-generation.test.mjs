import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyImageConfiguration } from "../lib/image-generation-project.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";
import { applyVideoConfiguration, videoGenerationSceneIds } from "../lib/video-generation-project.ts";

const fixtureUrl = new URL("../fixtures/projects/sample-project/project.json", import.meta.url);

async function fixture() {
  return parseProjectDocument(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

test("기본 영상 실행 대상에는 영상화가 선택된 장면만 포함된다", async () => {
  const project = await fixture();
  assert.deepEqual(videoGenerationSceneIds(project, undefined), ["scene-01", "scene-06"]);
  assert.throws(() => videoGenerationSceneIds(project, ["scene-02"]), /영상 대상으로 선택한 장면만/);
});

test("장면별 영상 후보 선택은 다른 장면과 이미지 선택을 변경하지 않는다", async () => {
  const project = await fixture();
  const source = project.assets.find((asset) => asset.id === "asset-image-scene-01");
  assert.ok(source);
  project.assets.push({
    ...structuredClone(source),
    id: "asset-video-scene-01-candidate",
    label: "1번 장면 영상 후보 1",
    kind: "video",
    role: "scene-video",
    stageId: "video",
    relativePath: "videos/scene-01-candidate.mp4",
    selected: false,
    sourceAssetIds: ["asset-image-scene-01", "asset-image-scene-02"],
    metadata: { format: "MP4", durationSeconds: 4 },
  });
  project.scenes[0].assetIds.push("asset-video-scene-01-candidate");
  const sceneSixImage = project.scenes[5].selectedImageAssetId;

  const updated = applyVideoConfiguration(project, {
    action: "select-video",
    sceneId: "scene-01",
    assetId: "asset-video-scene-01-candidate",
  }, "2026-10-21T02:00:00.000Z");

  assert.equal(updated.scenes[0].video.selectedAssetId, "asset-video-scene-01-candidate");
  assert.equal(updated.scenes[0].editing.selectedMedia, "video");
  assert.equal(updated.scenes[5].selectedImageAssetId, sceneSixImage);
  assert.doesNotThrow(() => parseProjectDocument(updated));
});

test("영상 대상 해제 시 기존 영상 파일은 보존하고 편집 미디어는 이미지로 되돌린다", async () => {
  const project = await fixture();
  project.scenes[0].editing.selectedMedia = "video";
  const assetCount = project.assets.length;
  const updated = applyImageConfiguration(project, {
    action: "set-video-plan",
    sceneId: "scene-01",
    enabled: false,
    mode: null,
    startImageAssetId: null,
    endImageAssetId: null,
  });
  assert.equal(updated.scenes[0].editing.selectedMedia, "image");
  assert.equal(updated.assets.length, assetCount);
});
