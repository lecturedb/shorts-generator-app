import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export type MusicBitrate = "128k" | "192k" | "320k";

export interface MusicGenerationInput {
  durationSeconds: number;
  mood: string;
  prompt: string;
  negativePrompt: string;
  instrumental: boolean;
  promptExpansion: boolean;
  inferenceSteps: number;
  guidanceScale: number;
  bitrate: MusicBitrate;
}

export interface MusicGenerationRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}

export type MusicConfigurationAction =
  | { action: "update-settings"; input: MusicGenerationInput }
  | { action: "select-music"; assetId: string };

