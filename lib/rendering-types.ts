import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export interface RenderRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}

export interface RenderRuntimeStatus {
  python: { available: boolean; version: string | null };
  ffmpeg: { available: boolean; version: string | null };
  ffprobe: { available: boolean; version: string | null };
}
