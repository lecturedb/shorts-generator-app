import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  listProjectFileEntries,
  projectFileContentType,
  projectFileKind,
} from "../lib/server/project-files-core.ts";
import {
  resolveProjectFilePath,
  saveProjectDocument,
} from "../lib/server/project-storage-core.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "fixtures/projects/sample-project/project.json"),
    "utf8",
  ),
);

async function temporaryStorage() {
  const projectsRoot = await mkdtemp(path.join(tmpdir(), "shorts-project-files-"));
  return {
    options: { projectsRoot },
    cleanup: () => rm(projectsRoot, { recursive: true, force: true }),
  };
}

test("실제 파일과 누락된 참조를 함께 파일 트리 항목으로 만든다", async () => {
  const storage = await temporaryStorage();
  try {
    const project = structuredClone(fixture);
    project.assets.push({
      id: "asset-video-missing", label: "누락 영상", kind: "video", role: "scene-video", stageId: "video", sceneId: "scene-01",
      relativePath: "videos/clip-missing.mp4", createdAt: "2026-10-20T00:08:00.000Z", selected: false, sourceAssetIds: ["asset-image-scene-01"], stale: { isStale: false }, metadata: { format: "MP4" },
    });
    project.scenes[0].assetIds.push("asset-video-missing");
    await saveProjectDocument(project, storage.options);
    const imagePath = project.assets[0].relativePath;
    const imageDestination = resolveProjectFilePath(project.project.id, imagePath, storage.options);
    await mkdir(path.dirname(imageDestination), { recursive: true });
    await copyFile(
      path.join(repositoryRoot, "fixtures/projects/sample-project", imagePath),
      imageDestination,
    );
    await writeFile(
      resolveProjectFilePath(
        project.project.id,
        "script/notes.bin",
        storage.options,
      ),
      "unsupported",
    );
    await writeFile(
      resolveProjectFilePath(project.project.id, ".DS_Store", storage.options),
      "finder metadata",
    );

    const files = await listProjectFileEntries(project.project.id, storage.options);
    const projectJson = files.find((file) => file.relativePath === "project.json");
    const image = files.find((file) => file.relativePath === imagePath);
    const missingVideo = files.find((file) => file.relativePath === "videos/clip-missing.mp4");
    const unsupported = files.find((file) => file.relativePath === "script/notes.bin");
    const finderMetadata = files.find((file) => file.relativePath === ".DS_Store");

    assert.equal(projectJson?.status, "available");
    assert.equal(projectJson?.kind, "json");
    assert.equal(image?.status, "available");
    assert.equal(image?.width, 540);
    assert.equal(missingVideo?.status, "missing");
    assert.match(missingVideo?.recoveryAction ?? "", /다시 실행|복구/);
    assert.equal(unsupported?.status, "unsupported");
    assert.match(unsupported?.issue ?? "", /지원하지/);
    assert.equal(finderMetadata, undefined);
  } finally {
    await storage.cleanup();
  }
});

test("미리보기 형식과 Content-Type을 허용 목록으로 제한한다", () => {
  assert.equal(projectFileKind("images/example.PNG"), "image");
  assert.equal(projectFileKind("images/example.webp"), "image");
  assert.equal(projectFileContentType("images/example.webp"), "image/webp");
  assert.equal(projectFileContentType("videos/example.mp4"), "video/mp4");
  assert.equal(projectFileKind("script/run.sh"), "unsupported");
  assert.equal(projectFileContentType("script/run.sh"), null);
});
