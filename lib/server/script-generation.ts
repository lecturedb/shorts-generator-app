import "server-only";

import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import type { ScriptGenerationRunResult } from "../script-generation-types";
import { applyGeneratedScriptResult } from "../script-generation-project";
import { assertWorkflowStepIncluded } from "../workflow-configuration";
import { parseScriptGenerationInput } from "../script-generation-validation";
import { generateScriptWithOpenAI } from "./openai-script-generation";
import { listProjects } from "./project-management";
import { loadProjectDocument, ProjectStorageError, saveProjectDocument } from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const globalRuns = globalThis as typeof globalThis & { __shortsActiveScriptRuns?: Set<string> };
const activeRuns = globalRuns.__shortsActiveScriptRuns ??= new Set<string>();

function scriptStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "script");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "대본·장면 구성 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown): string {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) {
    throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  }
  return `run-script-${requestId}`;
}

function runStatus(project: ProjectDocument, runId: string): WorkflowStatus {
  const run = project.runs.find((candidate) => candidate.id === runId);
  if (!run || run.stageId !== "script") throw new ProjectStorageError("READ_FAILED", "대본 생성 실행을 찾을 수 없습니다.");
  return run.status;
}

export async function startScriptGeneration(
  projectId: string,
  requestId: unknown,
  rawInput: unknown,
): Promise<ScriptGenerationRunResult & { created: boolean }> {
  const input = parseScriptGenerationInput(rawInput);
  const runId = runIdFor(requestId);
  const project = await loadProjectDocument(projectId);
  assertWorkflowStepIncluded(project, "script");
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(runId)) return { runId, status: "실행 중", project, created: false };

  const now = new Date().toISOString();
  project.runs.push({
    id: runId,
    stageId: "script",
    label: "OpenAI 대본·이미지 중심 장면 구성",
    status: "실행 중",
    message: "OpenAI 응답을 기다리고 있습니다.",
    startedAt: now,
    resultAssetIds: [],
  });
  const step = scriptStep(project);
  step.status = "실행 중";
  step.summary = "OpenAI 생성 중";
  step.settings = { tone: input.tone, sceneCount: input.sceneCount };
  project.project.status = "실행 중";
  project.project.updatedAt = now;
  activeRuns.add(runId);
  try {
    const saved = await saveProjectDocument(project);
    return { runId, status: "실행 중", project: saved, created: true };
  } catch (error) {
    activeRuns.delete(runId);
    throw error;
  }
}

export async function performScriptGeneration(
  projectId: string,
  runId: string,
  rawInput: unknown,
): Promise<void> {
  try {
    const input = parseScriptGenerationInput(rawInput);
    const generated = await generateScriptWithOpenAI(input);
    const imageModel = process.env.FAL_IMAGE_MODEL?.trim() ?? "";
    const latest = await loadProjectDocument(projectId);
    if (runStatus(latest, runId) !== "실행 중") return;
    await saveProjectDocument(applyGeneratedScriptResult(latest, input, generated.model, imageModel, generated.result, runId));
  } catch (error) {
    const latest = await loadProjectDocument(projectId).catch(() => null);
    if (latest) {
      const run = latest.runs.find((candidate) => candidate.id === runId);
      if (run?.status === "실행 중") {
        const message = error instanceof Error ? error.message : "대본 생성에 실패했습니다.";
        run.status = "실패";
        run.message = "기존 대본과 장면은 유지했습니다.";
        run.errorSummary = message;
        run.endedAt = new Date().toISOString();
        const step = scriptStep(latest);
        step.status = "실패";
        step.summary = "생성 실패 · 기존 결과 유지";
        latest.project.status = "실패";
        latest.project.updatedAt = new Date().toISOString();
        await saveProjectDocument(latest).catch(() => undefined);
      }
    }
  } finally {
    activeRuns.delete(runId);
  }
}

export async function getScriptGenerationRun(projectId: string, runIdInput: string): Promise<ScriptGenerationRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-script-/, ""));
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId);
  if (!run || run.stageId !== "script") throw new ProjectStorageError("READ_FAILED", "대본 생성 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(runId)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 실행 결과를 확인할 수 없습니다. 기존 결과는 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    const step = scriptStep(project);
    step.status = "확인 필요";
    step.summary = "중단된 실행 확인 필요";
    project.project.status = "확인 필요";
    project.project.updatedAt = new Date().toISOString();
    await saveProjectDocument(project);
  }
  return { runId, status: run.status, project };
}

export async function projectSummaries() {
  return (await listProjects()).projects;
}
