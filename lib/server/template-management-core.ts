import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, open, readFile, readdir, rename, rm, rmdir } from "node:fs/promises";

import { parseProjectDocument, workflowStepIds, type JsonSetting, type ProjectDocument, type WorkflowStepId } from "../project-schema.ts";
import type { ProjectTemplate } from "../template-types.ts";
import { fixedWorkflowOrder } from "../workflow-configuration.ts";
import { getProjectsRoot, ProjectStorageError, type ProjectStorageOptions } from "./project-storage-core.ts";

const templateIdPattern = /^template-[a-z0-9-]+$/;
const forbiddenSettingKeyPattern = /(api.?key|secret|credential|access.?token|refresh.?token)/i;

function templatesRoot(options: ProjectStorageOptions): string {
  return path.join(getProjectsRoot(options), "templates");
}

function legacyTemplatesRoot(options: ProjectStorageOptions): string {
  const projectsRoot = getProjectsRoot(options);
  return path.join(path.dirname(projectsRoot), `${path.basename(projectsRoot)}-templates`);
}

async function migrateLegacyTemplates(options: ProjectStorageOptions): Promise<void> {
  const legacyRoot = legacyTemplatesRoot(options);
  let entries;
  try { entries = await readdir(legacyRoot, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  const jsonFiles = entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json"));
  if (jsonFiles.length === 0) return;
  const root = templatesRoot(options);
  await mkdir(root, { recursive: true });
  for (const entry of jsonFiles) {
    const destination = path.join(root, entry.name);
    try {
      await readFile(destination, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await rename(path.join(legacyRoot, entry.name), destination);
    }
  }
  const remainingEntries = await readdir(legacyRoot);
  if (remainingEntries.length === 0) await rmdir(legacyRoot);
}

function templatePath(templateId: string, options: ProjectStorageOptions): string {
  if (!templateIdPattern.test(templateId)) throw new ProjectStorageError("INVALID_PATH", "템플릿 ID가 올바르지 않습니다.");
  return path.join(templatesRoot(options), `${templateId}.json`);
}

function templateName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new ProjectStorageError("WRITE_FAILED", "템플릿 이름을 입력해야 합니다.");
  const name = value.trim();
  if (name.length > 120) throw new ProjectStorageError("WRITE_FAILED", "템플릿 이름은 120자 이하여야 합니다.");
  return name;
}

function safeSettings(value: unknown, label: string): Record<string, JsonSetting> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProjectStorageError("READ_FAILED", `${label} 설정이 올바르지 않습니다.`);
  const result: Record<string, JsonSetting> = {};
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenSettingKeyPattern.test(key)) throw new ProjectStorageError("READ_FAILED", `${label}에 비밀값으로 보이는 항목이 포함되어 있습니다.`);
    if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      throw new ProjectStorageError("READ_FAILED", `${label}.${key} 값이 올바르지 않습니다.`);
    }
    result[key] = item as JsonSetting;
  }
  return result;
}

function parseTemplate(input: unknown): ProjectTemplate {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ProjectStorageError("READ_FAILED", "템플릿 문서가 올바르지 않습니다.");
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1 || typeof value.id !== "string" || !templateIdPattern.test(value.id)) throw new ProjectStorageError("READ_FAILED", "지원하지 않는 템플릿 문서입니다.");
  const settings = value.settings;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) throw new ProjectStorageError("READ_FAILED", "템플릿 설정이 없습니다.");
  const record = settings as Record<string, unknown>;
  const project = record.project as ProjectTemplate["settings"]["project"];
  const script = record.script as ProjectTemplate["settings"]["script"];
  const voice = record.voice as ProjectTemplate["settings"]["voice"];
  const music = record.music as ProjectTemplate["settings"]["music"];
  const output = record.output as ProjectTemplate["settings"]["output"];
  const videoDefaults = record.videoDefaults as ProjectTemplate["settings"]["videoDefaults"];
  const workflowInput = record.workflow;
  if (!project || !script || !voice || !music || !output || !videoDefaults || !Array.isArray(workflowInput)) throw new ProjectStorageError("READ_FAILED", "템플릿 제작 설정이 불완전합니다.");
  const workflow = workflowInput.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new ProjectStorageError("READ_FAILED", "템플릿 워크플로가 올바르지 않습니다.");
    const step = item as Record<string, unknown>;
    if (step.id !== fixedWorkflowOrder[index] || step.order !== index + 1 || typeof step.included !== "boolean") throw new ProjectStorageError("READ_FAILED", "템플릿은 고정된 6개 제작 단계 순서를 유지해야 합니다.");
    return { id: step.id as WorkflowStepId, order: step.order, included: step.included, settings: safeSettings(step.settings, `workflow.${String(step.id)}`) };
  });
  if (workflow.length !== workflowStepIds.length) throw new ProjectStorageError("READ_FAILED", "템플릿에는 6개 제작 단계가 필요합니다.");
  if (videoDefaults.mode !== "start_only" && videoDefaults.mode !== "start_end") throw new ProjectStorageError("READ_FAILED", "영상화 기본 방식이 올바르지 않습니다.");
  return {
    schemaVersion: 1,
    id: value.id,
    name: templateName(value.name),
    createdAt: String(value.createdAt),
    updatedAt: String(value.updatedAt),
    settings: {
      project: structuredClone(project),
      workflow,
      script: structuredClone(script),
      voice: { ...structuredClone(voice), input: safeSettings(voice.input, "voice.input") },
      music: { ...structuredClone(music), input: safeSettings(music.input, "music.input") },
      output: structuredClone(output),
      videoDefaults: structuredClone(videoDefaults),
    },
  };
}

function snapshot(projectInput: unknown, id: string, name: string, createdAt: string, updatedAt: string): ProjectTemplate {
  const project = parseProjectDocument(projectInput);
  const videoStep = project.workflow.steps.find((step) => step.id === "video");
  const selectedVideoScenes = project.scenes.filter((scene) => scene.video.enabled);
  const mode = selectedVideoScenes.some((scene) => scene.video.mode === "start_end") ? "start_end" : "start_only";
  return parseTemplate({
    schemaVersion: 1,
    id,
    name,
    createdAt,
    updatedAt,
    settings: {
      project: project.project.settings,
      workflow: project.workflow.steps
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((step) => ({ id: step.id, order: step.order, included: step.included, settings: step.id === "video" ? { ...step.settings, enabledByDefault: selectedVideoScenes.length > 0 || videoStep?.settings.enabledByDefault === true, modeByDefault: mode } : step.settings })),
      script: { provider: project.script.provider, model: project.script.model, topic: project.script.topic, targetDurationSeconds: project.script.targetDurationSeconds },
      voice: { provider: project.voice.provider, model: project.voice.model, endpoint: project.voice.endpoint, input: project.voice.input },
      music: { provider: project.music.provider, model: project.music.model, endpoint: project.music.endpoint, input: project.music.input },
      output: project.output.settings,
      videoDefaults: { enabled: selectedVideoScenes.length > 0 || videoStep?.settings.enabledByDefault === true, mode },
    },
  });
}

async function writeTemplate(template: ProjectTemplate, options: ProjectStorageOptions): Promise<ProjectTemplate> {
  const root = templatesRoot(options);
  await mkdir(root, { recursive: true });
  const destination = templatePath(template.id, options);
  const temporary = path.join(root, `.template-${randomUUID()}.tmp`);
  let created = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try { await handle.writeFile(`${JSON.stringify(template, null, 2)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, destination);
    created = false;
    return template;
  } finally {
    if (created) await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function listTemplates(options: ProjectStorageOptions = {}): Promise<ProjectTemplate[]> {
  await migrateLegacyTemplates(options);
  let entries;
  try { entries = await readdir(templatesRoot(options), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const templates: ProjectTemplate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) continue;
    const template = parseTemplate(JSON.parse(await readFile(path.join(templatesRoot(options), entry.name), "utf8")) as unknown);
    templates.push(template);
  }
  return templates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function loadTemplate(templateId: string, options: ProjectStorageOptions = {}): Promise<ProjectTemplate> {
  await migrateLegacyTemplates(options);
  try { return parseTemplate(JSON.parse(await readFile(templatePath(templateId, options), "utf8")) as unknown); }
  catch (error) { if (error instanceof ProjectStorageError) throw error; throw new ProjectStorageError("READ_FAILED", "템플릿을 읽을 수 없습니다.", { cause: error }); }
}

export async function createTemplate(nameInput: unknown, project: unknown, options: ProjectStorageOptions = {}): Promise<ProjectTemplate> {
  await migrateLegacyTemplates(options);
  const now = new Date().toISOString();
  return writeTemplate(snapshot(project, `template-${randomUUID()}`, templateName(nameInput), now, now), options);
}

export async function updateTemplate(templateId: string, nameInput: unknown, project: unknown, options: ProjectStorageOptions = {}): Promise<ProjectTemplate> {
  const current = await loadTemplate(templateId, options);
  return writeTemplate(snapshot(project, current.id, templateName(nameInput), current.createdAt, new Date().toISOString()), options);
}

export async function deleteTemplate(templateId: string, options: ProjectStorageOptions = {}): Promise<void> {
  await loadTemplate(templateId, options);
  await rm(templatePath(templateId, options), { force: false });
}

export function applyTemplateSettings(project: ProjectDocument, template: ProjectTemplate): ProjectDocument {
  const next = structuredClone(project);
  next.project.settings = structuredClone(template.settings.project);
  next.workflow.steps = next.workflow.steps.map((step) => {
    const saved = template.settings.workflow.find((candidate) => candidate.id === step.id)!;
    return { ...step, order: saved.order, included: saved.included, settings: structuredClone(saved.settings) };
  });
  const videoStep = next.workflow.steps.find((step) => step.id === "video");
  if (videoStep) videoStep.settings = { ...videoStep.settings, enabledByDefault: template.settings.videoDefaults.enabled, modeByDefault: template.settings.videoDefaults.mode };
  next.script = { ...next.script, ...structuredClone(template.settings.script), text: "", stale: { isStale: false } };
  next.voice = { ...next.voice, ...structuredClone(template.settings.voice), status: "대기", assetIds: [], selectedAssetId: null, timestamps: [], error: null };
  next.music = { ...next.music, ...structuredClone(template.settings.music), status: "대기", assetIds: [], selectedAssetId: null, error: null };
  next.output.settings = structuredClone(template.settings.output);
  return next;
}
