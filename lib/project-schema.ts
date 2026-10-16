export const PROJECT_SCHEMA_VERSION = 1 as const;

export const workflowStatuses = ["대기", "실행 중", "완료", "실패", "취소됨", "확인 필요"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export const workflowStepIds = ["script", "image", "video", "voice", "music", "editing"] as const;
export type WorkflowStepId = (typeof workflowStepIds)[number];

export type AssetKind = "image" | "video" | "audio";
export type AssetRole = "scene-image" | "scene-video" | "narration" | "background-music" | "final-output";
export type JsonSetting = string | number | boolean | null;

export interface StaleState {
  isStale: boolean;
  reason?: string;
}

export interface ProjectDocument {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    status: WorkflowStatus;
    settings: {
      aspectRatio: string;
      width: number;
      height: number;
      targetDurationSeconds: number;
    };
  };
  workflow: {
    steps: Array<{
      id: WorkflowStepId;
      label: string;
      order: number;
      included: boolean;
      status: WorkflowStatus;
      summary: string;
      settings: Record<string, JsonSetting>;
    }>;
  };
  script: {
    title: string;
    hook: string;
    narration: string;
    targetDurationSeconds: number;
    stale: StaleState;
  };
  scenes: Array<{
    id: string;
    order: number;
    narration: string;
    prompt: string;
    durationSeconds: number;
    assetIds: string[];
    stale: StaleState;
  }>;
  assets: Array<{
    id: string;
    label: string;
    kind: AssetKind;
    role: AssetRole;
    stageId: WorkflowStepId;
    sceneId?: string;
    relativePath: string;
    createdAt: string;
    selected: boolean;
    sourceAssetIds: string[];
    stale: StaleState;
    metadata: {
      format: string;
      width?: number;
      height?: number;
      durationSeconds?: number;
    };
  }>;
  runs: Array<{
    id: string;
    stageId: WorkflowStepId;
    sceneId?: string;
    label: string;
    status: WorkflowStatus;
    message: string;
    startedAt?: string;
    endedAt?: string;
    errorSummary?: string;
    resultAssetIds: string[];
  }>;
  output: {
    status: WorkflowStatus;
    assetId: string | null;
    stale: StaleState;
    settings: {
      aspectRatio: string;
      width: number;
      height: number;
      narrationVolume: number;
      musicVolume: number;
    };
  };
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const forbiddenSettingKeyPattern = /(api.?key|secret|credential|access.?token|refresh.?token)/i;
const statusSet = new Set<string>(workflowStatuses);
const stepIdSet = new Set<string>(workflowStepIds);
const assetKindSet = new Set<string>(["image", "video", "audio"] satisfies AssetKind[]);
const assetRoleSet = new Set<string>(["scene-image", "scene-video", "narration", "background-music", "final-output"] satisfies AssetRole[]);

function fail(path: string, message: string): never {
  throw new ProjectValidationError(path, message);
}

export class ProjectValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProjectValidationError";
    this.path = path;
  }
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "객체여야 합니다.");
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "배열이어야 합니다.");
  return value;
}

function stringAt(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) fail(path, "비어 있지 않은 문자열이어야 합니다.");
  return value;
}

function optionalStringAt(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return stringAt(value, path);
}

function numberAt(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(path, `${minimum} 이상의 유한한 숫자여야 합니다.`);
  return value;
}

function integerAt(value: unknown, path: string, minimum = 0): number {
  const parsed = numberAt(value, path, minimum);
  if (!Number.isInteger(parsed)) fail(path, "정수여야 합니다.");
  return parsed;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "불리언이어야 합니다.");
  return value;
}

function idAt(value: unknown, path: string): string {
  const id = stringAt(value, path);
  if (!idPattern.test(id)) fail(path, "소문자 영숫자와 하이픈으로 된 안정적인 ID여야 합니다.");
  return id;
}

function dateAt(value: unknown, path: string): string {
  const date = stringAt(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || Number.isNaN(Date.parse(date))) fail(path, "유효한 ISO 8601 날짜여야 합니다.");
  return date;
}

function statusAt(value: unknown, path: string): WorkflowStatus {
  const status = stringAt(value, path);
  if (!statusSet.has(status)) fail(path, `지원하지 않는 상태 '${status}'입니다.`);
  return status as WorkflowStatus;
}

function stepIdAt(value: unknown, path: string): WorkflowStepId {
  const stepId = stringAt(value, path);
  if (!stepIdSet.has(stepId)) fail(path, `지원하지 않는 제작 단계 '${stepId}'입니다.`);
  return stepId as WorkflowStepId;
}

function relativePathAt(value: unknown, path: string): string {
  const relativePath = stringAt(value, path);
  const segments = relativePath.split("/");
  if (
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    /^[a-zA-Z]:/.test(relativePath) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    fail(path, "프로젝트 내부의 정규화된 상대 경로여야 합니다.");
  }
  return relativePath;
}

function staleAt(value: unknown, path: string): StaleState {
  const stale = objectAt(value, path);
  const isStale = booleanAt(stale.isStale, `${path}.isStale`);
  const reason = optionalStringAt(stale.reason, `${path}.reason`);
  if (isStale && reason === undefined) fail(`${path}.reason`, "오래된 결과에는 이유가 필요합니다.");
  return reason === undefined ? { isStale } : { isStale, reason };
}

function uniqueIds(items: readonly { id: string }[], path: string): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) fail(`${path}[${index}].id`, `중복 ID '${item.id}'입니다.`);
    seen.add(item.id);
  });
}

function idListAt(value: unknown, path: string): string[] {
  const result = arrayAt(value, path).map((item, index) => idAt(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(path, "중복 ID를 포함할 수 없습니다.");
  return result;
}

function settingsAt(value: unknown, path: string): Record<string, JsonSetting> {
  const settings = objectAt(value, path);
  const parsed: Record<string, JsonSetting> = {};
  for (const [key, setting] of Object.entries(settings)) {
    if (forbiddenSettingKeyPattern.test(key)) fail(`${path}.${key}`, "API 키나 비밀값은 project.json에 저장할 수 없습니다.");
    if (setting !== null && !["string", "number", "boolean"].includes(typeof setting)) fail(`${path}.${key}`, "문자열, 숫자, 불리언 또는 null이어야 합니다.");
    if (typeof setting === "number" && !Number.isFinite(setting)) fail(`${path}.${key}`, "유한한 숫자여야 합니다.");
    parsed[key] = setting as JsonSetting;
  }
  return parsed;
}

export function parseProjectDocument(input: unknown): ProjectDocument {
  const root = objectAt(input, "project.json");
  if (root.schemaVersion !== PROJECT_SCHEMA_VERSION) fail("schemaVersion", `지원 버전 ${PROJECT_SCHEMA_VERSION}이어야 합니다.`);

  const projectValue = objectAt(root.project, "project");
  const project = {
    id: idAt(projectValue.id, "project.id"),
    name: stringAt(projectValue.name, "project.name"),
    description: stringAt(projectValue.description, "project.description", true),
    createdAt: dateAt(projectValue.createdAt, "project.createdAt"),
    updatedAt: dateAt(projectValue.updatedAt, "project.updatedAt"),
    status: statusAt(projectValue.status, "project.status"),
    settings: (() => {
      const settings = objectAt(projectValue.settings, "project.settings");
      return {
        aspectRatio: stringAt(settings.aspectRatio, "project.settings.aspectRatio"),
        width: integerAt(settings.width, "project.settings.width", 1),
        height: integerAt(settings.height, "project.settings.height", 1),
        targetDurationSeconds: numberAt(settings.targetDurationSeconds, "project.settings.targetDurationSeconds", 1),
      };
    })(),
  };

  const workflowValue = objectAt(root.workflow, "workflow");
  const steps = arrayAt(workflowValue.steps, "workflow.steps").map((value, index) => {
    const path = `workflow.steps[${index}]`;
    const step = objectAt(value, path);
    return {
      id: stepIdAt(step.id, `${path}.id`),
      label: stringAt(step.label, `${path}.label`),
      order: integerAt(step.order, `${path}.order`, 1),
      included: booleanAt(step.included, `${path}.included`),
      status: statusAt(step.status, `${path}.status`),
      summary: stringAt(step.summary, `${path}.summary`),
      settings: settingsAt(step.settings, `${path}.settings`),
    };
  });
  uniqueIds(steps, "workflow.steps");
  if (steps.length !== workflowStepIds.length || workflowStepIds.some((id) => !steps.some((step) => step.id === id))) {
    fail("workflow.steps", "고정된 6개 제작 단계를 각각 한 번씩 포함해야 합니다.");
  }
  if (new Set(steps.map((step) => step.order)).size !== steps.length) fail("workflow.steps", "단계 순서는 중복될 수 없습니다.");

  const scriptValue = objectAt(root.script, "script");
  const script = {
    title: stringAt(scriptValue.title, "script.title"),
    hook: stringAt(scriptValue.hook, "script.hook"),
    narration: stringAt(scriptValue.narration, "script.narration"),
    targetDurationSeconds: numberAt(scriptValue.targetDurationSeconds, "script.targetDurationSeconds", 1),
    stale: staleAt(scriptValue.stale, "script.stale"),
  };

  const scenes = arrayAt(root.scenes, "scenes").map((value, index) => {
    const path = `scenes[${index}]`;
    const scene = objectAt(value, path);
    return {
      id: idAt(scene.id, `${path}.id`),
      order: integerAt(scene.order, `${path}.order`, 1),
      narration: stringAt(scene.narration, `${path}.narration`),
      prompt: stringAt(scene.prompt, `${path}.prompt`),
      durationSeconds: numberAt(scene.durationSeconds, `${path}.durationSeconds`, 0.1),
      assetIds: idListAt(scene.assetIds, `${path}.assetIds`),
      stale: staleAt(scene.stale, `${path}.stale`),
    };
  });
  uniqueIds(scenes, "scenes");
  if (new Set(scenes.map((scene) => scene.order)).size !== scenes.length) fail("scenes", "장면 순서는 중복될 수 없습니다.");

  const assets = arrayAt(root.assets, "assets").map((value, index) => {
    const path = `assets[${index}]`;
    const asset = objectAt(value, path);
    const kind = stringAt(asset.kind, `${path}.kind`);
    const role = stringAt(asset.role, `${path}.role`);
    if (!assetKindSet.has(kind)) fail(`${path}.kind`, `지원하지 않는 자산 종류 '${kind}'입니다.`);
    if (!assetRoleSet.has(role)) fail(`${path}.role`, `지원하지 않는 자산 역할 '${role}'입니다.`);
    const metadata = objectAt(asset.metadata, `${path}.metadata`);
    return {
      id: idAt(asset.id, `${path}.id`),
      label: stringAt(asset.label, `${path}.label`),
      kind: kind as AssetKind,
      role: role as AssetRole,
      stageId: stepIdAt(asset.stageId, `${path}.stageId`),
      sceneId: optionalStringAt(asset.sceneId, `${path}.sceneId`),
      relativePath: relativePathAt(asset.relativePath, `${path}.relativePath`),
      createdAt: dateAt(asset.createdAt, `${path}.createdAt`),
      selected: booleanAt(asset.selected, `${path}.selected`),
      sourceAssetIds: idListAt(asset.sourceAssetIds, `${path}.sourceAssetIds`),
      stale: staleAt(asset.stale, `${path}.stale`),
      metadata: {
        format: stringAt(metadata.format, `${path}.metadata.format`),
        width: metadata.width === undefined ? undefined : integerAt(metadata.width, `${path}.metadata.width`, 1),
        height: metadata.height === undefined ? undefined : integerAt(metadata.height, `${path}.metadata.height`, 1),
        durationSeconds: metadata.durationSeconds === undefined ? undefined : numberAt(metadata.durationSeconds, `${path}.metadata.durationSeconds`, 0),
      },
    };
  });
  uniqueIds(assets, "assets");

  const runs = arrayAt(root.runs, "runs").map((value, index) => {
    const path = `runs[${index}]`;
    const run = objectAt(value, path);
    return {
      id: idAt(run.id, `${path}.id`),
      stageId: stepIdAt(run.stageId, `${path}.stageId`),
      sceneId: optionalStringAt(run.sceneId, `${path}.sceneId`),
      label: stringAt(run.label, `${path}.label`),
      status: statusAt(run.status, `${path}.status`),
      message: stringAt(run.message, `${path}.message`),
      startedAt: run.startedAt === undefined ? undefined : dateAt(run.startedAt, `${path}.startedAt`),
      endedAt: run.endedAt === undefined ? undefined : dateAt(run.endedAt, `${path}.endedAt`),
      errorSummary: optionalStringAt(run.errorSummary, `${path}.errorSummary`),
      resultAssetIds: idListAt(run.resultAssetIds, `${path}.resultAssetIds`),
    };
  });
  uniqueIds(runs, "runs");

  const outputValue = objectAt(root.output, "output");
  const outputSettings = objectAt(outputValue.settings, "output.settings");
  const output = {
    status: statusAt(outputValue.status, "output.status"),
    assetId: outputValue.assetId === null ? null : idAt(outputValue.assetId, "output.assetId"),
    stale: staleAt(outputValue.stale, "output.stale"),
    settings: {
      aspectRatio: stringAt(outputSettings.aspectRatio, "output.settings.aspectRatio"),
      width: integerAt(outputSettings.width, "output.settings.width", 1),
      height: integerAt(outputSettings.height, "output.settings.height", 1),
      narrationVolume: numberAt(outputSettings.narrationVolume, "output.settings.narrationVolume", 0),
      musicVolume: numberAt(outputSettings.musicVolume, "output.settings.musicVolume", 0),
    },
  };

  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  const requireScene = (sceneId: string | undefined, path: string) => {
    if (sceneId !== undefined && !sceneIds.has(sceneId)) fail(path, `존재하지 않는 장면 '${sceneId}'을 참조합니다.`);
  };
  const requireAssets = (ids: readonly string[], path: string) => ids.forEach((id, index) => {
    if (!assetIds.has(id)) fail(`${path}[${index}]`, `존재하지 않는 자산 '${id}'을 참조합니다.`);
  });
  scenes.forEach((scene, index) => requireAssets(scene.assetIds, `scenes[${index}].assetIds`));
  assets.forEach((asset, index) => {
    requireScene(asset.sceneId, `assets[${index}].sceneId`);
    requireAssets(asset.sourceAssetIds, `assets[${index}].sourceAssetIds`);
  });
  runs.forEach((run, index) => {
    requireScene(run.sceneId, `runs[${index}].sceneId`);
    requireAssets(run.resultAssetIds, `runs[${index}].resultAssetIds`);
  });
  if (output.assetId !== null) {
    requireAssets([output.assetId], "output.assetId");
    const finalAsset = assets.find((asset) => asset.id === output.assetId);
    if (finalAsset?.role !== "final-output") fail("output.assetId", "최종 출력 역할의 자산을 참조해야 합니다.");
  }

  return { schemaVersion: PROJECT_SCHEMA_VERSION, project, workflow: { steps }, script, scenes, assets, runs, output };
}
