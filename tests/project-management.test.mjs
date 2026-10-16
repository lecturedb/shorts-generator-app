import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProject,
  deleteProject,
  listProjects,
  renameProject,
  saveManagedProject,
} from "../lib/server/project-management-core.ts";
import { loadProjectDocument, ProjectStorageError } from "../lib/server/project-storage-core.ts";

async function temporaryStorage() {
  const projectsRoot = await mkdtemp(path.join(tmpdir(), "shorts-project-management-"));
  return {
    options: { projectsRoot },
    cleanup: () => rm(projectsRoot, { recursive: true, force: true }),
  };
}

test("프로젝트 A와 B를 생성하고 전환해도 저장 데이터가 유지된다", async () => {
  const storage = await temporaryStorage();
  try {
    const projectA = await createProject("프로젝트 A", storage.options);
    const projectB = await createProject("프로젝트 B", storage.options);
    projectA.project.description = "A에만 저장한 설명";
    await saveManagedProject(projectA.project.id, projectA, storage.options);

    assert.equal((await loadProjectDocument(projectB.project.id, storage.options)).project.name, "프로젝트 B");
    assert.equal((await loadProjectDocument(projectA.project.id, storage.options)).project.description, "A에만 저장한 설명");
    assert.deepEqual((await listProjects(storage.options)).projects.map((project) => project.name).sort(), ["프로젝트 A", "프로젝트 B"]);
  } finally {
    await storage.cleanup();
  }
});

test("이름 변경을 저장하고 삭제 확인 불일치 시 프로젝트를 보존한다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = await createProject("변경 전", storage.options);
    await renameProject(project.project.id, "변경 후", storage.options);
    assert.equal((await loadProjectDocument(project.project.id, storage.options)).project.name, "변경 후");

    await assert.rejects(
      deleteProject(project.project.id, "wrong-project", storage.options),
      (error) => error instanceof ProjectStorageError && error.code === "WRITE_FAILED",
    );
    assert.equal((await loadProjectDocument(project.project.id, storage.options)).project.name, "변경 후");
  } finally {
    await storage.cleanup();
  }
});

test("확정 삭제 시 프로젝트 폴더와 목록을 함께 갱신한다", async () => {
  const storage = await temporaryStorage();
  try {
    const first = await createProject("삭제 대상", storage.options);
    const second = await createProject("유지 대상", storage.options);
    const result = await deleteProject(first.project.id, first.project.id, storage.options);

    assert.equal(result.deletedProjectId, first.project.id);
    assert.deepEqual(result.projects.map((project) => project.id), [second.project.id]);
    await assert.rejects(loadProjectDocument(first.project.id, storage.options));
    assert.equal((await loadProjectDocument(second.project.id, storage.options)).project.name, "유지 대상");
  } finally {
    await storage.cleanup();
  }
});
