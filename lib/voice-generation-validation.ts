import type { VoiceGenerationInput } from "./voice-generation-types";

const languageCodePattern = /^[a-z]{2}$/;
const normalizations = new Set(["auto", "on", "off"]);

function recordAt(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("더빙 설정이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new Error(`${label} 설정이 올바르지 않습니다.`);
  }
  return value.trim();
}

function numberAt(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}은(는) ${minimum}~${maximum} 범위여야 합니다.`);
  }
  return value;
}

export function parseVoiceGenerationInput(value: unknown): VoiceGenerationInput {
  const input = recordAt(value);
  const languageCode = stringAt(input.languageCode, "언어 코드", 2).toLowerCase();
  if (!languageCodePattern.test(languageCode)) throw new Error("언어 코드는 ISO 639-1 형식이어야 합니다.");
  const textNormalization = stringAt(input.textNormalization, "텍스트 정규화", 4);
  if (!normalizations.has(textNormalization)) throw new Error("텍스트 정규화 설정이 올바르지 않습니다.");
  if (typeof input.timestamps !== "boolean") throw new Error("타임스탬프 설정이 올바르지 않습니다.");
  return {
    voice: stringAt(input.voice, "목소리", 200),
    languageCode,
    speed: numberAt(input.speed, "속도", 0.7, 1.2),
    stability: numberAt(input.stability, "안정성", 0, 1),
    similarityBoost: numberAt(input.similarityBoost, "유사도", 0, 1),
    style: numberAt(input.style, "스타일", 0, 1),
    textNormalization: textNormalization as VoiceGenerationInput["textNormalization"],
    timestamps: input.timestamps,
  };
}

export function voiceInputSettings(input: VoiceGenerationInput) {
  return {
    voice: input.voice,
    language_code: input.languageCode,
    speed: input.speed,
    stability: input.stability,
    similarity_boost: input.similarityBoost,
    style: input.style,
    apply_text_normalization: input.textNormalization,
    timestamps: input.timestamps,
  };
}
