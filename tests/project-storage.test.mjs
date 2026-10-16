import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ProjectStorageError,
  createProjectDirectories,
  inspectProjectFile,
  listProjectFiles,
  loadProjectDocument,
  projectMediaDirectories,
  resolveProjectFilePath,
  saveProjectDocument,
} from "../lib/server/project-storage-core.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(await readFile(path.join(repositoryRoot, "fixtures/projects/sample-project.json"), "utf8"));

function cloneFixture() {
  return structuredClone(fixture);
}

async function temporaryStorage() {
  const projectsRoot = await mkdtemp(path.join(tmpdir(), "shorts-project-storage-"));
  return {
    options: { projectsRoot },
    cleanup: () => rm(projectsRoot, { recursive: true, force: true }),
  };
}

const sampleSources = new Map([
  ["scene-image", "scene-01.png"],
  ["scene-video", "clip-01.mp4"],
  ["narration", "narration.mp3"],
  ["background-music", "background.mp3"],
  ["final-output", "clip-01.mp4"],
]);

async function copySampleAssets(project, options) {
  await Promise.all(project.assets.map(async (asset) => {
    const sourceName = sampleSources.get(asset.role);
    assert.ok(sourceName, `샘플 소스가 필요합니다: ${asset.role}`);
    await copyFile(
      path.join(repositoryRoot, "public/samples", sourceName),
      resolveProjectFilePath(project.project.id, asset.relativePath, options),
    );
  }));
}

test("프로젝트 구조를 만들고 JSON과 미디어를 재로드한다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = cloneFixture();
    const directories = await createProjectDirectories(project.project.id, storage.options);
    assert.deepEqual(Object.keys(directories), [...projectMediaDirectories]);

    const saved = await saveProjectDocument(project, storage.options);
    await copySampleAssets(project, storage.options);

    const restored = await loadProjectDocument(project.project.id, { ...storage.options });
    const files = await listProjectFiles(project.project.id, { ...storage.options });
    const paths = files.map((file) => file.relativePath);

    assert.deepEqual(restored, saved);
    assert.ok(paths.includes("project.json"));
    assert.ok(paths.includes("images/scene-01.png"));
    assert.ok(paths.includes("videos/clip-01.mp4"));
    assert.ok(paths.includes("audio/narration.mp3"));
    assert.ok(paths.includes("output/final.mp4"));
    assert.ok(files.every((file) => file.sizeBytes > 0));
  } finally {
    await storage.cleanup();
  }
});

test("검증 실패 시 기존 project.json과 완료 파일을 보존한다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = cloneFixture();
    await saveProjectDocument(project, storage.options);
    await copySampleAssets(project, storage.options);
    const originalJson = await readFile(resolveProjectFilePath(project.project.id, "project.json", storage.options), "utf8");

    const invalidProject = cloneFixture();
    delete invalidProject.project.name;
    await assert.rejects(saveProjectDocument(invalidProject, storage.options));

    const currentJson = await readFile(resolveProjectFilePath(project.project.id, "project.json", storage.options), "utf8");
    const image = await inspectProjectFile(project.project.id, "images/scene-01.png", storage.options);
    const projectEntries = await readdir(path.dirname(resolveProjectFilePath(project.project.id, "project.json", storage.options)));
    assert.equal(currentJson, originalJson);
    assert.equal(image.status, "available");
    assert.equal(projectEntries.some((entry) => entry.endsWith(".tmp")), false);
  } finally {
    await storage.cleanup();
  }
});

test("프로젝트 밖 경로를 거부하고 누락 파일을 복구 가능한 상태로 반환한다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = cloneFixture();
    await saveProjectDocument(project, storage.options);

    assert.throws(
      () => resolveProjectFilePath(project.project.id, "../outside.json", storage.options),
      (error) => error instanceof ProjectStorageError && error.code === "INVALID_PATH",
    );
    assert.throws(
      () => resolveProjectFilePath("../../outside", "project.json", storage.options),
      (error) => error instanceof ProjectStorageError && error.code === "INVALID_PROJECT_ID",
    );

    const missing = await inspectProjectFile(project.project.id, "images/missing.png", storage.options);
    assert.deepEqual(missing, {
      status: "missing",
      relativePath: "images/missing.png",
      message: "파일이 없습니다. 기존 프로젝트 데이터는 유지되며 복구 또는 재생성이 필요합니다.",
    });
    assert.equal((await loadProjectDocument(project.project.id, storage.options)).project.id, project.project.id);
  } finally {
    await storage.cleanup();
  }
});

test("상대 저장 루트 설정을 거부한다", () => {
  assert.throws(
    () => resolveProjectFilePath("sample-local-project", "project.json", { projectsRoot: "relative/projects" }),
    (error) => error instanceof ProjectStorageError && error.code === "INVALID_CONFIG",
  );
});
