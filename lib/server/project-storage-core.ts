import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";

import { parseProjectDocument, type ProjectDocument } from "../project-schema.ts";

export const projectMediaDirectories = ["script", "images", "videos", "audio", "output"] as const;
export type ProjectMediaDirectory = (typeof projectMediaDirectories)[number];

export interface ProjectStorageOptions {
  projectsRoot?: string;
}

export interface ProjectFileMetadata {
  status: "available";
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface MissingProjectFile {
  status: "missing";
  relativePath: string;
  message: string;
}

export type ProjectFileInspection = ProjectFileMetadata | MissingProjectFile;

export class ProjectStorageError extends Error {
  readonly code: "INVALID_CONFIG" | "INVALID_PROJECT_ID" | "INVALID_PATH" | "READ_FAILED" | "WRITE_FAILED";

  constructor(code: ProjectStorageError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectStorageError";
    this.code = code;
  }
}

const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertProjectId(projectId: string): void {
  if (!projectIdPattern.test(projectId)) {
    throw new ProjectStorageError("INVALID_PROJECT_ID", "프로젝트 ID는 소문자 영숫자와 하이픈만 사용할 수 있습니다.");
  }
}

function assertRelativePath(relativePath: string): void {
  const segments = relativePath.split("/");
  if (
    relativePath.trim() === "" ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    /^[a-zA-Z]:/.test(relativePath) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new ProjectStorageError("INVALID_PATH", "프로젝트 내부의 정규화된 상대 경로만 사용할 수 있습니다.");
  }
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

export function getProjectsRoot(options: ProjectStorageOptions = {}): string {
  const configuredRoot = options.projectsRoot ?? process.env.SHORTS_PROJECTS_DIR;
  const projectsRoot = configuredRoot || path.join(homedir(), "Library", "Application Support", "shorts-generator-app", "projects");
  if (!path.isAbsolute(projectsRoot)) {
    throw new ProjectStorageError("INVALID_CONFIG", "SHORTS_PROJECTS_DIR은 절대 경로여야 합니다.");
  }
  return path.normalize(projectsRoot);
}

export function getProjectDirectory(projectId: string, options: ProjectStorageOptions = {}): string {
  assertProjectId(projectId);
  return path.join(getProjectsRoot(options), projectId);
}

export function resolveProjectFilePath(projectId: string, relativePath: string, options: ProjectStorageOptions = {}): string {
  assertRelativePath(relativePath);
  const projectDirectory = getProjectDirectory(projectId, options);
  const resolved = path.resolve(projectDirectory, ...relativePath.split("/"));
  if (!isInside(projectDirectory, resolved)) {
    throw new ProjectStorageError("INVALID_PATH", "프로젝트 경계 밖의 경로에는 접근할 수 없습니다.");
  }
  return resolved;
}

async function assertNoDirectorySymlink(directory: string, projectsRoot: string): Promise<void> {
  const [resolvedRoot, resolvedDirectory] = await Promise.all([realpath(projectsRoot), realpath(directory)]);
  if (!isInside(resolvedRoot, resolvedDirectory)) {
    throw new ProjectStorageError("INVALID_PATH", "프로젝트 디렉터리가 저장 루트 밖을 가리킵니다.");
  }
}

export async function createProjectDirectories(projectId: string, options: ProjectStorageOptions = {}): Promise<Record<ProjectMediaDirectory, string>> {
  const projectsRoot = getProjectsRoot(options);
  const projectDirectory = getProjectDirectory(projectId, options);
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(projectDirectory, { recursive: true });
  await assertNoDirectorySymlink(projectDirectory, projectsRoot);

  const entries = await Promise.all(projectMediaDirectories.map(async (directory) => {
    const directoryPath = path.join(projectDirectory, directory);
    await mkdir(directoryPath, { recursive: true });
    return [directory, directoryPath] as const;
  }));
  return Object.fromEntries(entries) as Record<ProjectMediaDirectory, string>;
}

export async function saveProjectDocument(input: unknown, options: ProjectStorageOptions = {}): Promise<ProjectDocument> {
  const project = parseProjectDocument(input);
  const projectDirectory = getProjectDirectory(project.project.id, options);
  await createProjectDirectories(project.project.id, options);

  const destination = path.join(projectDirectory, "project.json");
  const temporaryPath = path.join(projectDirectory, `.project-${randomUUID()}.tmp`);
  let temporaryCreated = false;

  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(`${JSON.stringify(project, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, destination);
    temporaryCreated = false;
    return project;
  } catch (error) {
    if (temporaryCreated) await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("WRITE_FAILED", `project.json 저장에 실패했습니다: ${project.project.id}`, { cause: error });
  }
}

export async function loadProjectDocument(projectId: string, options: ProjectStorageOptions = {}): Promise<ProjectDocument> {
  const projectDirectory = getProjectDirectory(projectId, options);
  const projectsRoot = getProjectsRoot(options);

  try {
    await assertNoDirectorySymlink(projectDirectory, projectsRoot);
    const json = await readFile(path.join(projectDirectory, "project.json"), "utf8");
    const project = parseProjectDocument(JSON.parse(json) as unknown);
    if (project.project.id !== projectId) {
      throw new ProjectStorageError("READ_FAILED", "프로젝트 디렉터리와 project.json의 ID가 일치하지 않습니다.");
    }
    return project;
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("READ_FAILED", `project.json을 읽을 수 없습니다: ${projectId}`, { cause: error });
  }
}

export async function resolveExistingProjectFilePath(projectId: string, relativePath: string, options: ProjectStorageOptions = {}): Promise<string | null> {
  const projectDirectory = getProjectDirectory(projectId, options);
  const candidate = resolveProjectFilePath(projectId, relativePath, options);

  try {
    const [resolvedProject, resolvedCandidate] = await Promise.all([realpath(projectDirectory), realpath(candidate)]);
    if (!isInside(resolvedProject, resolvedCandidate)) {
      throw new ProjectStorageError("INVALID_PATH", "파일이 프로젝트 경계 밖을 가리킵니다.");
    }
    return resolvedCandidate;
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ProjectStorageError("READ_FAILED", `파일 경로를 확인할 수 없습니다: ${relativePath}`, { cause: error });
  }
}

export async function inspectProjectFile(projectId: string, relativePath: string, options: ProjectStorageOptions = {}): Promise<ProjectFileInspection> {
  const existingPath = await resolveExistingProjectFilePath(projectId, relativePath, options);
  if (existingPath === null) {
    return { status: "missing", relativePath, message: "파일이 없습니다. 기존 프로젝트 데이터는 유지되며 복구 또는 재생성이 필요합니다." };
  }

  const fileStat = await stat(existingPath);
  if (!fileStat.isFile()) {
    throw new ProjectStorageError("INVALID_PATH", "일반 파일만 조회할 수 있습니다.");
  }
  return {
    status: "available",
    relativePath,
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
  };
}

export async function listProjectFiles(projectId: string, options: ProjectStorageOptions = {}): Promise<ProjectFileMetadata[]> {
  const projectDirectory = getProjectDirectory(projectId, options);
  const projectsRoot = getProjectsRoot(options);

  try {
    await assertNoDirectorySymlink(projectDirectory, projectsRoot);
    const files: ProjectFileMetadata[] = [];

    async function visit(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".project-") && entry.name.endsWith(".tmp")) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          throw new ProjectStorageError("INVALID_PATH", "프로젝트 내부의 심볼릭 링크는 파일 목록에서 허용되지 않습니다.");
        }
        if (entry.isDirectory()) {
          await visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const fileStat = await stat(absolutePath);
        files.push({
          status: "available",
          relativePath: normalizeRelativePath(path.relative(projectDirectory, absolutePath)),
          sizeBytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(),
        });
      }
    }

    await visit(projectDirectory);
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  } catch (error) {
    if (error instanceof ProjectStorageError) throw error;
    throw new ProjectStorageError("READ_FAILED", `프로젝트 파일 목록을 읽을 수 없습니다: ${projectId}`, { cause: error });
  }
}
