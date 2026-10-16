import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: WorkflowStatus;
}

export interface ProjectListResult {
  projects: ProjectSummary[];
  errors: Array<{ projectId: string; message: string }>;
}

export interface ProjectMutationResult {
  project: ProjectDocument;
  projects: ProjectSummary[];
}

export interface ProjectDeletionResult {
  deletedProjectId: string;
  deletedFileCount: number;
  projects: ProjectSummary[];
}
