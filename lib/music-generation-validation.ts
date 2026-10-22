import type { JsonSetting } from "./project-schema";
import type { MusicBitrate, MusicGenerationInput } from "./music-generation-types";

const bitrates = new Set<MusicBitrate>(["128k", "192k", "320k"]);

function recordAt(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("음악 설정이 올바르지 않습니다.");
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, label: string, maximum: number, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "") || value.trim().length > maximum) {
    throw new Error(`${label} 설정이 올바르지 않습니다.`);
  }
  return value.trim();
}

function numberAt(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}은(는) ${minimum}~${maximum} 범위여야 합니다.`);
  }
  return value;
}

function booleanAt(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`${label} 설정이 올바르지 않습니다.`);
  return value;
}

export function parseMusicGenerationInput(value: unknown): MusicGenerationInput {
  const input = recordAt(value);
  const bitrate = stringAt(input.bitrate, "비트레이트", 4) as MusicBitrate;
  if (!bitrates.has(bitrate)) throw new Error("비트레이트 설정이 올바르지 않습니다.");
  const durationSeconds = numberAt(input.durationSeconds, "음악 길이", 10, 180);
  if (!Number.isInteger(durationSeconds)) throw new Error("음악 길이는 10~180초 사이의 정수여야 합니다.");
  return {
    durationSeconds,
    mood: stringAt(input.mood, "분위기", 200),
    prompt: stringAt(input.prompt, "음악 프롬프트", 4_000),
    negativePrompt: stringAt(input.negativePrompt, "제외 프롬프트", 2_000, true),
    instrumental: booleanAt(input.instrumental, "연주곡"),
    promptExpansion: booleanAt(input.promptExpansion, "프롬프트 확장"),
    inferenceSteps: Math.round(numberAt(input.inferenceSteps, "추론 단계", 1, 100)),
    guidanceScale: numberAt(input.guidanceScale, "프롬프트 반영 강도", 0, 20),
    bitrate,
  };
}

export function musicInputSettings(input: MusicGenerationInput): Record<string, JsonSetting> {
  return {
    mood: input.mood,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    instrumental: input.instrumental,
    prompt_expansion: input.promptExpansion,
    inference_steps: input.inferenceSteps,
    guidance_scale: input.guidanceScale,
    bitrate: input.bitrate,
    target_duration_seconds: input.durationSeconds,
  };
}

export function musicPrompt(input: MusicGenerationInput) {
  return `${input.mood}. ${input.prompt}${input.instrumental ? ". Instrumental only, no vocals, no lyrics." : ""}`;
}

export type MusicModelFamily = "stable-audio-3" | "stable-audio-25" | "elevenlabs" | "stable-audio" | "cassette" | "generic";

export function musicModelFamily(model: string): MusicModelFamily {
  const normalized = model.toLowerCase();
  if (normalized.includes("stable-audio-3/")) return "stable-audio-3";
  if (normalized.includes("stable-audio-25/")) return "stable-audio-25";
  if (normalized.includes("elevenlabs/music")) return "elevenlabs";
  if (normalized === "fal-ai/stable-audio") return "stable-audio";
  if (normalized === "cassetteai/music-generator") return "cassette";
  return "generic";
}

export function musicModelMaximumDuration(model: string) {
  const family = musicModelFamily(model);
  if (family === "stable-audio-3") return model.toLowerCase().includes("/medium/") ? 380 : 120;
  if (family === "stable-audio-25") return 190;
  if (family === "elevenlabs") return 600;
  if (family === "cassette") return 180;
  return 180;
}

export function falMusicInput(model: string, input: MusicGenerationInput, durationSeconds: number): Record<string, JsonSetting> {
  const family = musicModelFamily(model);
  const prompt = musicPrompt(input);
  if (durationSeconds < 3 || durationSeconds > musicModelMaximumDuration(model)) {
    throw new Error(`현재 음악 모델은 3~${musicModelMaximumDuration(model)}초 길이를 지원합니다.`);
  }
  if (family === "stable-audio-3") {
    return {
      prompt,
      negative_prompt: input.negativePrompt,
      duration: durationSeconds,
      num_inference_steps: input.inferenceSteps,
      guidance_scale: input.guidanceScale,
      enable_prompt_expansion: input.promptExpansion,
      enable_safety_checker: true,
      output_format: "mp3",
      bitrate: input.bitrate,
    };
  }
  if (family === "stable-audio-25") {
    return {
      prompt,
      seconds_total: Math.round(durationSeconds),
      num_inference_steps: input.inferenceSteps,
      guidance_scale: input.guidanceScale,
      enable_safety_checker: true,
    };
  }
  if (family === "elevenlabs") {
    return {
      prompt,
      music_length_ms: Math.round(durationSeconds * 1_000),
      force_instrumental: input.instrumental,
      output_format: `mp3_44100_${input.bitrate.replace("k", "")}`,
    };
  }
  if (family === "stable-audio") {
    return { prompt, seconds_total: Math.round(durationSeconds), steps: input.inferenceSteps, enable_safety_checker: true };
  }
  return { prompt, duration: Math.round(durationSeconds) };
}

