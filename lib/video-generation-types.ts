import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export interface VideoGenerationRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}

export type VideoConfigurationAction = {
  action: "select-video";
  sceneId: string;
  assetId: string;
};
