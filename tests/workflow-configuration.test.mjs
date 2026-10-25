import assert from "node:assert/strict";
import test from "node:test";

import { applyVideoDefaults, assertWorkflowStepIncluded, workflowInputBlockers } from "../lib/workflow-configuration.ts";
import { parseProjectDocument } from "../lib/project-schema.ts";
import fixture from "../fixtures/projects/sample-project/project.json" with { type: "json" };

test("제외된 단계 실행은 이유와 함께 차단된다", () => {
  const project = parseProjectDocument(structuredClone(fixture));
  project.workflow.steps.find((step) => step.id === "video").included = false;
  assert.throws(() => assertWorkflowStepIncluded(project, "video"), /제외되어 있어 실행할 수 없습니다/);
  assert.match(workflowInputBlockers(project, "video")[0], /제외/);
});

test("최종 편집에 필요한 장면 미디어가 없으면 장면 번호를 안내한다", () => {
  const project = parseProjectDocument(structuredClone(fixture));
  project.assets = [];
  for (const scene of project.scenes) {
    scene.selectedImageAssetId = null;
    scene.video.selectedAssetId = null;
  }
  const blockers = workflowInputBlockers(project, "editing");
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /1번/);
  assert.match(blockers[0], /편집용 이미지 또는 영상/);
});

test("템플릿의 영상화 기본값은 대표 이미지가 준비된 장면에만 적용된다", () => {
  const project = parseProjectDocument(structuredClone(fixture));
  const videoStep = project.workflow.steps.find((step) => step.id === "video");
  videoStep.settings = { enabledByDefault: true, modeByDefault: "start_only" };
  project.scenes[0].video.enabled = false;
  project.scenes[0].video.mode = null;
  project.scenes[0].video.startImageAssetId = null;
  project.scenes[1].selectedImageAssetId = null;
  project.scenes[1].video.enabled = false;

  applyVideoDefaults(project);

  assert.equal(project.scenes[0].video.enabled, true);
  assert.equal(project.scenes[0].video.startImageAssetId, project.scenes[0].selectedImageAssetId);
  assert.equal(project.scenes[1].video.enabled, false);
});
