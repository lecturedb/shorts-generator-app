import type { WorkflowStepId } from "./project-schema";

export type ProjectFileKind =
  | "json"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "unsupported";

export type ProjectFileStatus = "available" | "missing" | "unsupported";

export interface ProjectFileEntry {
  id: string;
  label: string;
  relativePath: string;
  stageId: "project" | WorkflowStepId;
  kind: ProjectFileKind;
  status: ProjectFileStatus;
  format: string;
  sizeBytes?: number;
  createdAt?: string;
  modifiedAt?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  selected: boolean;
  stale: boolean;
  issue?: string;
  recoveryAction?: string;
}

export interface ProjectFilesResult {
  files: ProjectFileEntry[];
}
