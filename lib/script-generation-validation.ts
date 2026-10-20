import type {
  ScriptGenerationInput,
  ScriptGenerationResult,
  ScriptGenerationScene,
} from "./script-generation-types";

export class OpenAIScriptGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OpenAIScriptGenerationError";
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OpenAIScriptGenerationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OpenAIScriptGenerationError(`${label}은(는) 비어 있지 않은 문자열이어야 합니다.`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new OpenAIScriptGenerationError(`${label}은(는) ${maximum}자 이하여야 합니다.`);
  }
  return result;
}

function finiteNumber(value: unknown, label: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new OpenAIScriptGenerationError(`${label}은(는) ${minimum} 이상의 숫자여야 합니다.`);
  }
  return value;
}

function koreanString(value: unknown, label: string, maximum: number): string {
  const result = requiredString(value, label, maximum);
  if (!/[가-힣]/.test(result)) {
    throw new OpenAIScriptGenerationError(`${label}은(는) 한국어로 작성되어야 합니다.`);
  }
  return result;
}

export function parseScriptGenerationInput(input: unknown): ScriptGenerationInput {
  const value = objectValue(input, "생성 설정");
  const targetDurationSeconds = finiteNumber(value.targetDurationSeconds, "목표 길이", 10);
  const sceneCount = finiteNumber(value.sceneCount, "장면 수", 1);
  if (!Number.isInteger(targetDurationSeconds) || targetDurationSeconds > 180) {
    throw new OpenAIScriptGenerationError("목표 길이는 10~180초 사이의 정수여야 합니다.");
  }
  if (!Number.isInteger(sceneCount) || sceneCount > 20) {
    throw new OpenAIScriptGenerationError("장면 수는 1~20개 사이의 정수여야 합니다.");
  }
  return {
    topic: requiredString(value.topic, "주제", 500),
    targetDurationSeconds,
    sceneCount,
    tone: requiredString(value.tone, "말투", 100),
  };
}

function parseScene(value: unknown, index: number): ScriptGenerationScene {
  const scene = objectValue(value, `${index + 1}번 장면`);
  return {
    order: finiteNumber(scene.order, `${index + 1}번 장면 순서`, 1),
    startSeconds: finiteNumber(scene.startSeconds, `${index + 1}번 장면 시작 시간`, 0),
    durationSeconds: finiteNumber(scene.durationSeconds, `${index + 1}번 장면 길이`, 0.1),
    narration: requiredString(scene.narration, `${index + 1}번 장면 내레이션`, 2_000),
    visual: koreanString(scene.visual, `${index + 1}번 장면 시각적 내용`, 2_000),
    imagePrompt: requiredString(scene.imagePrompt, `${index + 1}번 장면 이미지 프롬프트`, 4_000),
  };
}

export function parseScriptGenerationResult(
  input: unknown,
  settings: ScriptGenerationInput,
): ScriptGenerationResult {
  const value = objectValue(input, "OpenAI 응답");
  if (!Array.isArray(value.scenes) || value.scenes.length !== settings.sceneCount) {
    throw new OpenAIScriptGenerationError(`OpenAI 응답에는 정확히 ${settings.sceneCount}개 장면이 필요합니다.`);
  }
  const scenes = value.scenes.map(parseScene);
  let expectedStart = 0;
  scenes.forEach((scene, index) => {
    if (!Number.isInteger(scene.order) || scene.order !== index + 1) {
      throw new OpenAIScriptGenerationError("장면 순서는 1부터 빠짐없이 이어져야 합니다.");
    }
    if (Math.abs(scene.startSeconds - expectedStart) > 0.11) {
      throw new OpenAIScriptGenerationError("장면 시작 시간은 앞 장면 종료 시간과 이어져야 합니다.");
    }
    expectedStart = scene.startSeconds + scene.durationSeconds;
  });
  if (Math.abs(expectedStart - settings.targetDurationSeconds) > 0.11) {
    throw new OpenAIScriptGenerationError("장면 길이의 합이 목표 길이와 일치하지 않습니다.");
  }

  const script = scenes.map((scene) => scene.narration).join(" ");
  const suppliedScript = requiredString(value.script, "전체 대본", 20_000);
  if (suppliedScript.replace(/\s+/g, " ").trim() !== script.replace(/\s+/g, " ").trim()) {
    throw new OpenAIScriptGenerationError("전체 대본과 장면별 내레이션이 일치하지 않습니다.");
  }
  return { script, scenes };
}
