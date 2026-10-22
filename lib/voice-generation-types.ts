import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export type TextNormalization = "auto" | "on" | "off";

export interface VoiceGenerationInput {
  voice: string;
  languageCode: string;
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
  textNormalization: TextNormalization;
  timestamps: boolean;
}

export interface VoiceGenerationRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}

export type VoiceConfigurationAction = {
  action: "select-voice";
  assetId: string;
};
