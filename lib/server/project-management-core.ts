import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";

import { markMusicStaleForDurationChange } from "../music-generation-project.ts";
import { parseProjectDocument, type ProjectDocument } from "../project-schema.ts";
import type { ProjectDeletionResult, ProjectListResult, ProjectSummary } from "../project-management-types.ts";
import {
  ProjectStorageError,
  getProjectDirectory,
  getProjectsRoot,
  listProjectFiles,
  loadProjectDocument,
  saveProjectDocument,
  type ProjectStorageOptions,
} from "./project-storage-core.ts";

const workflowSteps: ProjectDocument["workflow"]["steps"] = [
  { id: "script", label: "대본·장면 구성", order: 1, included: true, status: "대기", summary: "실행 전", settings: {} },
  { id: "image", label: "이미지 생성", order: 2, included: true, status: "대기", summary: "실행 전", settings: {} },
  { id: "video", label: "영상 생성", order: 3, included: true, status: "대기", summary: "실행 전", settings: {} },
  { id: "voice", label: "더빙", order: 4, included: true, status: "대기", summary: "실행 전", settings: {} },
  { id: "music", label: "배경음악", order: 5, included: true, status: "대기", summary: "실행 전", settings: {} },
  { id: "editing", label: "최종 편집", order: 6, included: true, status: "대기", summary: "실행 전", settings: {} },
];

function projectName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProjectStorageError("WRITE_FAILED", "프로젝트 이름을 입력해야 합니다.");
  }
  const name = value.trim();
  if (name.length > 120) throw new ProjectStorageError("WRITE_FAILED", "프로젝트 이름은 120자 이하여야 합니다.");
  return name;
}

function summaryOf(project: ProjectDocument): ProjectSummary {
  return {
    id: project.project.id,
    name: project.project.name,
    description: project.project.description,
    createdAt: project.project.createdAt,
    updatedAt: project.project.updatedAt,
    status: project.project.status,
  };
}

export async function listProjects(options: ProjectStorageOptions = {}): Promise<ProjectListResult> {
  const projectsRoot = getProjectsRoot(options);
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { projects: [], errors: [] };
    throw new ProjectStorageError("READ_FAILED", "프로젝트 목록을 읽을 수 없습니다.", { cause: error });
  }

  const projects: ProjectSummary[] = [];
  const errors: ProjectListResult["errors"] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    try {
      projects.push(summaryOf(await loadProjectDocument(entry.name, options)));
    } catch (error) {
      errors.push({ projectId: entry.name, message: error instanceof Error ? error.message : "프로젝트를 읽을 수 없습니다." });
    }
  }
  projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { projects, errors };
}

export async function createProject(nameInput: unknown, options: ProjectStorageOptions = {}): Promise<ProjectDocument> {
  const name = projectName(nameInput);
  const now = new Date().toISOString();
  const project: ProjectDocument = {
    schemaVersion: 4,
    project: {
      id: `project-${randomUUID()}`,
      name,
      description: "",
      createdAt: now,
      updatedAt: now,
      status: "대기",
      settings: { aspectRatio: "9:16", width: 1080, height: 1920, targetDurationSeconds: 30, fps: 30 },
    },
    workflow: { steps: workflowSteps.map((step) => ({ ...step, settings: { ...step.settings } })) },
    script: { provider: null, model: null, topic: "", text: "", targetDurationSeconds: 30, stale: { isStale: false } },
    scenes: [],
    assets: [],
    runs: [],
    voice: { provider: null, model: null, endpoint: null, inputSource: "script.text", input: {}, status: "대기", assetIds: [], selectedAssetId: null, timestamps: [], error: null },
    music: { provider: null, model: null, endpoint: null, input: {}, status: "대기", assetIds: [], selectedAssetId: null, error: null },
    editing: { status: "대기", error: null, timeline: null },
    output: {
      status: "대기",
      assetId: null,
      stale: { isStale: false },
      settings: { aspectRatio: "9:16", width: 1080, height: 1920, fps: 30, quality: "standard" },
    },
  };
  return saveProjectDocument(project, options);
}

export async function renameProject(projectId: string, nameInput: unknown, options: ProjectStorageOptions = {}): Promise<ProjectDocument> {
  const project = await loadProjectDocument(projectId, options);
  project.project.name = projectName(nameInput);
  project.project.updatedAt = new Date().toISOString();
  return saveProjectDocument(project, options);
}

export async function saveManagedProject(projectId: string, input: unknown, options: ProjectStorageOptions = {}): Promise<ProjectDocument> {
  const current = await loadProjectDocument(projectId, options);
  const candidate = structuredClone(input) as Record<string, unknown>;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new ProjectStorageError("WRITE_FAILED", "저장할 프로젝트 데이터가 올바르지 않습니다.");
  }
  const projectValue = candidate.project;
  if (typeof projectValue !== "object" || projectValue === null || Array.isArray(projectValue)) {
    throw new ProjectStorageError("WRITE_FAILED", "프로젝트 기본 정보가 없습니다.");
  }
  const projectRecord = projectValue as Record<string, unknown>;
  if (projectRecord.id !== projectId || projectRecord.id !== current.project.id) {
    throw new ProjectStorageError("WRITE_FAILED", "다른 프로젝트 ID로 저장할 수 없습니다.");
  }
  projectRecord.updatedAt = new Date().toISOString();
  const parsed = parseProjectDocument(candidate);
  markMusicStaleForDurationChange(parsed, current.project.settings.targetDurationSeconds);
  return saveProjectDocument(parsed, options);
}

export async function deleteProject(projectId: string, confirmation: unknown, options: ProjectStorageOptions = {}): Promise<ProjectDeletionResult> {
  if (confirmation !== projectId) {
    throw new ProjectStorageError("WRITE_FAILED", "삭제 확인 ID가 일치하지 않습니다.");
  }
  await loadProjectDocument(projectId, options);
  const files = await listProjectFiles(projectId, options);
  await rm(getProjectDirectory(projectId, options), { recursive: true, force: false });
  const { projects } = await listProjects(options);
  return { deletedProjectId: projectId, deletedFileCount: files.length, projects };
}
