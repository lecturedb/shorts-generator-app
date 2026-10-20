import type { ProjectDocument, WorkflowStatus } from "./project-schema";

export interface ScriptGenerationInput {
  topic: string;
  targetDurationSeconds: number;
  sceneCount: number;
  tone: string;
}

export interface ScriptGenerationScene {
  order: number;
  startSeconds: number;
  durationSeconds: number;
  narration: string;
  visual: string;
  imagePrompt: string;
}

export interface ScriptGenerationResult {
  script: string;
  scenes: ScriptGenerationScene[];
}

export interface ScriptGenerationRunResult {
  runId: string;
  status: WorkflowStatus;
  project: ProjectDocument;
}
