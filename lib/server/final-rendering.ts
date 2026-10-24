import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { timelineDuration, validateEditingTimeline } from "../editing-timeline";
import type { ProjectDocument, WorkflowStatus } from "../project-schema";
import type { RenderRunResult, RenderRuntimeStatus } from "../rendering-types";
import { listProjects } from "./project-management";
import {
  loadProjectDocument,
  ProjectStorageError,
  resolveExistingProjectFilePath,
  resolveProjectFilePath,
  saveProjectDocument,
} from "./project-storage";

const requestIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const globalState = globalThis as typeof globalThis & {
  __shortsActiveRenderRuns?: Map<string, ChildProcess | null>;
  __shortsCancelledRenderRuns?: Set<string>;
};
const activeRuns = globalState.__shortsActiveRenderRuns ??= new Map();
const cancelledRuns = globalState.__shortsCancelledRenderRuns ??= new Set();

function runKey(projectId: string, runId: string) {
  return `${projectId}:${runId}`;
}

function renderStep(project: ProjectDocument) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "editing");
  if (!step) throw new ProjectStorageError("WRITE_FAILED", "최종 편집 단계를 찾을 수 없습니다.");
  return step;
}

function runIdFor(requestId: unknown): string {
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) || requestId.length > 100) {
    throw new ProjectStorageError("WRITE_FAILED", "유효한 실행 ID가 필요합니다.");
  }
  return `run-render-${requestId}`;
}

async function commandVersion(command: string, argument = "-version"): Promise<string | null> {
  return await new Promise((resolve) => {
    const child = spawn(command, [argument], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code === 0 ? output.split(/\r?\n/, 1)[0]?.trim() || null : null));
  });
}

export async function getRenderRuntimeStatus(): Promise<RenderRuntimeStatus> {
  const [pythonVersion, ffmpegVersion, ffprobeVersion] = await Promise.all([
    commandVersion("python3", "--version"),
    commandVersion("ffmpeg"),
    commandVersion("ffprobe"),
  ]);
  return {
    python: { available: pythonVersion !== null, version: pythonVersion },
    ffmpeg: { available: ffmpegVersion !== null, version: ffmpegVersion },
    ffprobe: { available: ffprobeVersion !== null, version: ffprobeVersion },
  };
}

async function requireRuntime() {
  const runtime = await getRenderRuntimeStatus();
  if (!runtime.python.available || !runtime.ffmpeg.available || !runtime.ffprobe.available) {
    const missing = [
      !runtime.python.available ? "Python 3.12" : null,
      !runtime.ffmpeg.available ? "FFmpeg 7.1" : null,
      !runtime.ffprobe.available ? "ffprobe" : null,
    ].filter(Boolean).join(", ");
    throw new ProjectStorageError("WRITE_FAILED", `${missing}을(를) 찾을 수 없습니다. README.md의 설치 안내를 확인해 주세요.`);
  }
  const pythonMatch = runtime.python.version?.match(/Python\s+(\d+)\.(\d+)/);
  const ffmpegMatch = runtime.ffmpeg.version?.match(/ffmpeg version\s+(\d+)\.(\d+)/);
  const pythonSupported = pythonMatch && (Number(pythonMatch[1]) > 3 || Number(pythonMatch[1]) === 3 && Number(pythonMatch[2]) >= 12);
  const ffmpegSupported = ffmpegMatch && (Number(ffmpegMatch[1]) > 7 || Number(ffmpegMatch[1]) === 7 && Number(ffmpegMatch[2]) >= 1);
  if (!pythonSupported || !ffmpegSupported) {
    throw new ProjectStorageError("WRITE_FAILED", "최종 렌더링에는 Python 3.12 이상과 FFmpeg 7.1 이상이 필요합니다. README.md의 설치 안내를 확인해 주세요.");
  }
}

async function resolveAssetPath(project: ProjectDocument, assetId: string) {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`렌더링 자산 '${assetId}'을 찾을 수 없습니다.`);
  const absolutePath = await resolveExistingProjectFilePath(project.project.id, asset.relativePath);
  if (!absolutePath) throw new Error(`렌더링 입력 파일이 누락되었습니다: ${asset.label}`);
  return absolutePath;
}

async function buildManifest(project: ProjectDocument, outputPath: string) {
  const timeline = project.editing.timeline;
  if (!timeline) throw new Error("먼저 최종 편집 타임라인을 만들어 주세요.");
  const assetPaths = new Map<string, string>();
  for (const assetId of new Set([
    ...timeline.sceneClips.map((clip) => clip.assetId),
    ...(timeline.narration ? [timeline.narration.assetId] : []),
    ...(timeline.music ? [timeline.music.assetId] : []),
  ])) assetPaths.set(assetId, await resolveAssetPath(project, assetId));

  let narrationSourceStart = timeline.narration?.startSeconds ?? 0;
  const narrationSegments = timeline.narration?.segments.map((segment) => {
    const durationSeconds = segment.endSeconds - segment.startSeconds;
    const result = { ...segment, sourceStartSeconds: narrationSourceStart, durationSeconds };
    narrationSourceStart += durationSeconds;
    return result;
  }) ?? [];
  return {
    outputPath,
    durationSeconds: timelineDuration(timeline),
    settings: project.output.settings,
    clips: timeline.sceneClips.map((clip) => ({ ...clip, inputPath: assetPaths.get(clip.assetId) })),
    transitions: timeline.transitions,
    narration: timeline.narration ? {
      assetId: timeline.narration.assetId,
      inputPath: assetPaths.get(timeline.narration.assetId),
      volume: timeline.narration.volume,
      segments: narrationSegments,
    } : null,
    music: timeline.music ? {
      ...timeline.music,
      inputPath: assetPaths.get(timeline.music.assetId),
    } : null,
    subtitles: timeline.subtitles,
  };
}

function runProcess(command: string, args: string[], key: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    activeRuns.set(key, child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString("utf8")).slice(-20_000); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-20_000); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (cancelledRuns.has(key)) reject(new Error("렌더링이 취소되었습니다."));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim().split(/\r?\n/).at(-1) || `렌더링 프로세스가 종료되었습니다 (${signal ?? code}).`));
    });
  });
}

async function inspectOutput(filePath: string, width: number, height: number, expectedAudio: boolean) {
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type,width,height,duration", "-of", "json", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || "출력 파일을 검사할 수 없습니다.")));
  });
  const parsed = JSON.parse(result.stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }>; format?: { duration?: string } };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(parsed.format?.duration);
  if (!video || video.codec_name !== "h264" || video.width !== width || video.height !== height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("출력 MP4의 코덱, 해상도 또는 재생 시간이 올바르지 않습니다.");
  }
  if (expectedAudio && (!audio || Number(audio.duration) < durationSeconds - 0.25)) {
    throw new Error("출력 MP4의 오디오가 영상 끝까지 합성되지 않았습니다.");
  }
  return durationSeconds;
}

export async function startFinalRender(projectId: string, requestId: unknown): Promise<RenderRunResult & { created: boolean }> {
  await requireRuntime();
  const runId = runIdFor(requestId);
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const existing = project.runs.find((run) => run.id === runId);
  if (existing) return { runId, status: existing.status, project, created: false };
  if (activeRuns.has(key)) return { runId, status: "실행 중", project, created: false };
  if (!project.editing.timeline) throw new ProjectStorageError("WRITE_FAILED", "먼저 최종 편집 타임라인을 만들어 주세요.");
  const availableIds = new Set<string>();
  for (const asset of project.assets) {
    if (await resolveExistingProjectFilePath(projectId, asset.relativePath)) availableIds.add(asset.id);
  }
  const errors = validateEditingTimeline(project, availableIds);
  if (errors.length > 0) throw new ProjectStorageError("WRITE_FAILED", `렌더링 입력을 확인해 주세요. ${errors.join(" ")}`);

  const now = new Date().toISOString();
  project.runs.push({ id: runId, stageId: "editing", label: "Python·FFmpeg 최종 MP4 렌더링", status: "실행 중", message: "격리된 작업 디렉터리에서 최종 영상을 합성하고 있습니다.", startedAt: now, resultAssetIds: [] });
  project.editing.status = "처리 중";
  project.editing.error = null;
  project.output.status = "실행 중";
  const step = renderStep(project);
  step.status = "실행 중";
  step.summary = "최종 MP4 렌더링 중";
  project.project.status = "실행 중";
  project.project.updatedAt = now;
  activeRuns.set(key, null);
  cancelledRuns.delete(key);
  try {
    return { runId, status: "실행 중", project: await saveProjectDocument(project), created: true };
  } catch (error) {
    activeRuns.delete(key);
    throw error;
  }
}

export async function performFinalRender(projectId: string, runId: string): Promise<void> {
  const key = runKey(projectId, runId);
  const workRelativePath = `output/.render-${runId}`;
  const workDirectory = resolveProjectFilePath(projectId, workRelativePath);
  const temporaryOutput = path.join(workDirectory, "render.mp4");
  try {
    await mkdir(workDirectory, { recursive: false, mode: 0o700 });
    let project = await loadProjectDocument(projectId);
    const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "editing");
    if (!run || run.status !== "실행 중") return;
    const manifest = await buildManifest(project, temporaryOutput);
    const manifestPath = path.join(workDirectory, "manifest.json");
    const handle = await open(manifestPath, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(manifest)}\n`, "utf8"); } finally { await handle.close(); }
    const scriptPath = path.join(process.cwd(), "scripts", "render_final.py");
    await runProcess("python3", [scriptPath, manifestPath], key);
    if (cancelledRuns.has(key)) return;
    const durationSeconds = await inspectOutput(
      temporaryOutput,
      project.output.settings.width,
      project.output.settings.height,
      Boolean(manifest.narration || manifest.music),
    );
    const assetId = `asset-output-${randomUUID()}`;
    const relativePath = `output/final-${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
    project = await loadProjectDocument(projectId);
    let currentRun = project.runs.find((candidate) => candidate.id === runId);
    if (!currentRun || currentRun.status !== "실행 중") return;
    const finalPath = resolveProjectFilePath(projectId, relativePath);
    await rename(temporaryOutput, finalPath);
    project = await loadProjectDocument(projectId);
    currentRun = project.runs.find((candidate) => candidate.id === runId);
    if (!currentRun || currentRun.status !== "실행 중") {
      await rm(finalPath, { force: true }).catch(() => undefined);
      return;
    }
    for (const asset of project.assets) if (asset.role === "final-output") asset.selected = false;
    project.assets.push({
      id: assetId,
      label: `최종 MP4 ${project.assets.filter((asset) => asset.role === "final-output").length + 1}`,
      kind: "video",
      role: "final-output",
      stageId: "editing",
      relativePath,
      createdAt: new Date().toISOString(),
      selected: true,
      sourceAssetIds: [...new Set([
        ...manifest.clips.map((clip) => clip.assetId),
        ...(manifest.narration ? [manifest.narration.assetId] : []),
        ...(manifest.music ? [manifest.music.assetId] : []),
      ])],
      stale: { isStale: false },
      metadata: { format: "MP4", width: project.output.settings.width, height: project.output.settings.height, durationSeconds },
    });
    project.output.assetId = assetId;
    project.output.status = "완료";
    project.output.stale = { isStale: false };
    project.editing.status = "완료";
    project.editing.error = null;
    currentRun.status = "완료";
    currentRun.message = `${project.output.settings.width}×${project.output.settings.height} ${project.output.settings.fps}fps MP4를 검증해 저장했습니다.`;
    currentRun.endedAt = new Date().toISOString();
    currentRun.resultAssetIds.push(assetId);
    const step = renderStep(project);
    step.status = "완료";
    step.summary = "최종 MP4 완료";
    step.settings = { ...project.output.settings };
    project.project.status = "완료";
    project.project.updatedAt = currentRun.endedAt;
    await saveProjectDocument(project);
  } catch (error) {
    const project = await loadProjectDocument(projectId).catch(() => null);
    const wasCancelled = cancelledRuns.has(key);
    if (project) {
      const run = project.runs.find((candidate) => candidate.id === runId);
      if (run?.status === "실행 중") {
        run.status = wasCancelled ? "취소됨" : "실패";
        run.message = wasCancelled ? "렌더링을 취소했습니다. 기존 완료본과 원본 미디어는 유지했습니다." : "렌더링에 실패했습니다. 기존 완료본과 원본 미디어는 유지했습니다.";
        run.errorSummary = wasCancelled ? undefined : error instanceof Error ? error.message : "최종 MP4 렌더링에 실패했습니다.";
        run.endedAt = new Date().toISOString();
      }
      project.editing.status = project.output.assetId ? "확인 필요" : "실패";
      project.editing.error = wasCancelled ? null : error instanceof Error ? error.message : "최종 MP4 렌더링에 실패했습니다.";
      project.output.status = wasCancelled ? "취소됨" : "실패";
      const step = renderStep(project);
      step.status = wasCancelled ? "취소됨" : "실패";
      step.summary = wasCancelled ? "렌더링 취소됨" : "렌더링 실패 · 재시도 가능";
      project.project.status = step.status;
      project.project.updatedAt = new Date().toISOString();
      await saveProjectDocument(project).catch(() => undefined);
    }
  } finally {
    activeRuns.delete(key);
    cancelledRuns.delete(key);
    await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function cancelFinalRender(projectId: string, runIdInput: string): Promise<RenderRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-render-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "editing");
  if (!run) throw new ProjectStorageError("READ_FAILED", "최종 렌더링 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중") {
    cancelledRuns.add(key);
    activeRuns.get(key)?.kill("SIGTERM");
    run.status = "취소됨";
    run.message = "렌더링을 취소했습니다. 기존 완료본과 원본 미디어는 유지했습니다.";
    run.endedAt = new Date().toISOString();
    project.editing.status = project.output.assetId ? "확인 필요" : "대기";
    project.editing.error = null;
    project.output.status = "취소됨";
    const step = renderStep(project);
    step.status = "취소됨";
    step.summary = "렌더링 취소됨";
    project.project.status = "취소됨";
    project.project.updatedAt = run.endedAt;
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function getFinalRenderRun(projectId: string, runIdInput: string): Promise<RenderRunResult> {
  const runId = runIdFor(runIdInput.replace(/^run-render-/, ""));
  const key = runKey(projectId, runId);
  const project = await loadProjectDocument(projectId);
  const run = project.runs.find((candidate) => candidate.id === runId && candidate.stageId === "editing");
  if (!run) throw new ProjectStorageError("READ_FAILED", "최종 렌더링 실행을 찾을 수 없습니다.");
  if (run.status === "실행 중" && !activeRuns.has(key)) {
    run.status = "확인 필요";
    run.message = "서버 재시작으로 렌더링 결과 확인이 필요합니다. 기존 완료본은 유지되었습니다.";
    run.endedAt = new Date().toISOString();
    project.editing.status = "확인 필요";
    project.output.status = "확인 필요";
    renderStep(project).status = "확인 필요";
    await saveProjectDocument(project);
  }
  return { runId, status: run.status as WorkflowStatus, project };
}

export async function renderProjectSummaries() {
  return (await listProjects()).projects;
}
