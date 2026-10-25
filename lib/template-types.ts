import type { JsonSetting, OutputQuality, SceneVideoMode, WorkflowStepId } from "./project-schema";

export interface ProjectTemplate {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: {
    project: {
      aspectRatio: string;
      width: number;
      height: number;
      targetDurationSeconds: number;
      fps: number;
    };
    workflow: Array<{
      id: WorkflowStepId;
      order: number;
      included: boolean;
      settings: Record<string, JsonSetting>;
    }>;
    script: {
      provider: string | null;
      model: string | null;
      topic: string;
      targetDurationSeconds: number;
    };
    voice: {
      provider: string | null;
      model: string | null;
      endpoint: string | null;
      input: Record<string, JsonSetting>;
    };
    music: {
      provider: string | null;
      model: string | null;
      endpoint: string | null;
      input: Record<string, JsonSetting>;
    };
    output: {
      aspectRatio: string;
      width: number;
      height: number;
      fps: number;
      quality: OutputQuality;
    };
    videoDefaults: {
      enabled: boolean;
      mode: SceneVideoMode;
    };
  };
}

export interface TemplateListResult {
  templates: ProjectTemplate[];
}
