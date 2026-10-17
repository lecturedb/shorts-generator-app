import path from "node:path";

import type {
  ProjectFileEntry,
  ProjectFileKind,
} from "../project-file-types.ts";
import type { ProjectDocument, WorkflowStepId } from "../project-schema.ts";
import {
  inspectProjectFile,
  listProjectFiles,
  loadProjectDocument,
  type ProjectFileMetadata,
  type ProjectStorageOptions,
} from "./project-storage-core.ts";

const supportedExtensions: Readonly<Record<string, ProjectFileKind>> = {
  ".json": "json",
  ".txt": "text",
  ".md": "text",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".aac": "audio",
};

export const projectFileContentTypes: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

export function projectFileKind(relativePath: string): ProjectFileKind {
  return supportedExtensions[path.extname(relativePath).toLowerCase()] ?? "unsupported";
}

export function projectFileContentType(relativePath: string): string | null {
  return projectFileContentTypes[path.extname(relativePath).toLowerCase()] ?? null;
}

function stageForPath(relativePath: string): "project" | WorkflowStepId {
  if (relativePath === "project.json") return "project";
  if (relativePath.startsWith("script/")) return "script";
  if (relativePath.startsWith("images/")) return "image";
  if (relativePath.startsWith("videos/")) return "video";
  if (relativePath.startsWith("audio/")) return "voice";
  if (relativePath.startsWith("output/")) return "editing";
  return "project";
}

function formatForPath(relativePath: string): string {
  const extension = path.extname(relativePath).slice(1);
  return extension ? extension.toUpperCase() : "알 수 없음";
}

function entryFromFile(
  file: ProjectFileMetadata,
  project: ProjectDocument,
): ProjectFileEntry {
  const asset = project.assets.find(
    (candidate) => candidate.relativePath === file.relativePath,
  );
  const kind = projectFileKind(file.relativePath);
  const unsupported = kind === "unsupported";

  return {
    id: asset?.id ?? `file:${file.relativePath}`,
    label: asset?.label ?? path.posix.basename(file.relativePath),
    relativePath: file.relativePath,
    stageId: asset?.stageId ?? stageForPath(file.relativePath),
    kind,
    status: unsupported ? "unsupported" : "available",
    format: asset?.metadata.format ?? formatForPath(file.relativePath),
    sizeBytes: file.sizeBytes,
    createdAt: asset?.createdAt,
    modifiedAt: file.modifiedAt,
    width: asset?.metadata.width,
    height: asset?.metadata.height,
    durationSeconds: asset?.metadata.durationSeconds,
    selected: asset?.selected ?? false,
    stale: asset?.stale.isStale ?? false,
    ...(unsupported
      ? {
          issue: "이 파일 형식은 앱에서 미리보기를 지원하지 않습니다.",
          recoveryAction: "JSON, 텍스트, 이미지, MP4/WebM 또는 일반 오디오 형식으로 변환한 뒤 다시 확인하세요.",
        }
      : {}),
  };
}

export async function listProjectFileEntries(
  projectId: string,
  options: ProjectStorageOptions = {},
): Promise<ProjectFileEntry[]> {
  const [project, existingFiles] = await Promise.all([
    loadProjectDocument(projectId, options),
    listProjectFiles(projectId, options),
  ]);
  const entries = existingFiles.map((file) => entryFromFile(file, project));
  const existingPaths = new Set(entries.map((entry) => entry.relativePath));

  for (const asset of project.assets) {
    if (existingPaths.has(asset.relativePath)) continue;
    const inspection = await inspectProjectFile(projectId, asset.relativePath, options);
    if (inspection.status !== "missing") continue;
    entries.push({
      id: asset.id,
      label: asset.label,
      relativePath: asset.relativePath,
      stageId: asset.stageId,
      kind: projectFileKind(asset.relativePath),
      status: "missing",
      format: asset.metadata.format,
      createdAt: asset.createdAt,
      width: asset.metadata.width,
      height: asset.metadata.height,
      durationSeconds: asset.metadata.durationSeconds,
      selected: asset.selected,
      stale: asset.stale.isStale,
      issue: inspection.message,
      recoveryAction: "이 단계 또는 해당 장면을 다시 실행하거나, 원래 경로에 파일을 복구하세요.",
    });
  }

  return entries.sort((left, right) => {
    if (left.relativePath === "project.json") return -1;
    if (right.relativePath === "project.json") return 1;
    return left.relativePath.localeCompare(right.relativePath);
  });
}
