import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export interface ImageGenerationRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}

export type ImageConfigurationAction =
  | { action: "select-image"; sceneId: string; assetId: string }
  | {
      action: "set-video-plan";
      sceneId: string;
      enabled: boolean;
      mode: "start_only" | "start_end" | null;
      startImageAssetId: string | null;
      endImageAssetId: string | null;
    }
  | { action: "set-video-prompt"; sceneId: string; prompt: string };

