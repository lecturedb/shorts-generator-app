import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../lib/server/project-management-core.ts";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "../lib/server/template-management-core.ts";

async function temporaryStorage() {
  const projectsRoot = await mkdtemp(path.join(tmpdir(), "shorts-template-management-"));
  return {
    options: { projectsRoot },
    cleanup: async () => {
      await rm(projectsRoot, { recursive: true, force: true });
      await rm(path.join(path.dirname(projectsRoot), `${path.basename(projectsRoot)}-templates`), { recursive: true, force: true });
    },
  };
}

test("템플릿은 제작 설정만 저장하고 새 프로젝트에 결과 데이터 없이 적용한다", async () => {
  const storage = await temporaryStorage();
  try {
    const source = await createProject("원본", storage.options);
    source.project.settings.width = 720;
    source.project.settings.height = 1280;
    source.script.topic = "재사용할 주제 기본값";
    source.script.text = "복사되면 안 되는 생성 대본";
    source.workflow.steps.find((step) => step.id === "video").included = false;
    source.workflow.steps.find((step) => step.id === "music").settings.prompt = "잔잔한 배경음악";
    source.runs.push({ id: "run-script-old", stageId: "script", label: "기존 실행", status: "완료", message: "완료", resultAssetIds: [] });

    const template = await createTemplate("세로형 기본", source, storage.options);
    const created = await createProject("템플릿 프로젝트", storage.options, template.id);

    assert.equal(created.project.settings.width, 720);
    assert.equal(created.script.topic, "재사용할 주제 기본값");
    assert.equal(created.script.text, "");
    assert.deepEqual(created.scenes, []);
    assert.deepEqual(created.assets, []);
    assert.deepEqual(created.runs, []);
    assert.equal(created.workflow.steps.find((step) => step.id === "video").included, false);
    assert.equal(created.workflow.steps.find((step) => step.id === "music").settings.prompt, "잔잔한 배경음악");
  } finally { await storage.cleanup(); }
});

test("기존 형제 템플릿 폴더를 프로젝트 저장소의 templates 폴더로 이전한다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = await createProject("원본", storage.options);
    const created = await createTemplate("이전 대상", project, storage.options);
    const newRoot = path.join(storage.options.projectsRoot, "templates");
    const legacyRoot = path.join(path.dirname(storage.options.projectsRoot), `${path.basename(storage.options.projectsRoot)}-templates`);
    await mkdir(legacyRoot, { recursive: true });
    await rename(path.join(newRoot, `${created.id}.json`), path.join(legacyRoot, `${created.id}.json`));

    const templates = await listTemplates(storage.options);
    assert.equal(templates[0].id, created.id);
    assert.equal(templates[0].name, "이전 대상");
    const migrated = await readFile(path.join(newRoot, `${created.id}.json`), "utf8");
    assert.match(migrated, /이전 대상/);
  } finally { await storage.cleanup(); }
});

test("템플릿 수정과 삭제 결과가 파일 저장소에 유지된다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = await createProject("원본", storage.options);
    const created = await createTemplate("초기 이름", project, storage.options);
    project.workflow.steps.find((step) => step.id === "voice").included = false;
    await updateTemplate(created.id, "수정 이름", project, storage.options);

    const reopened = await listTemplates(storage.options);
    assert.equal(reopened[0].name, "수정 이름");
    assert.equal(reopened[0].settings.workflow.find((step) => step.id === "voice").included, false);

    await deleteTemplate(created.id, storage.options);
    assert.deepEqual(await listTemplates(storage.options), []);
  } finally { await storage.cleanup(); }
});
