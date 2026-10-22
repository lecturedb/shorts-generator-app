import "server-only";

import { ApiError, createFalClient } from "@fal-ai/client";

import type { VoiceGenerationInput } from "../voice-generation-types";
import { voiceInputSettings } from "../voice-generation-validation";
import { normalizeFalVoiceTimestamps } from "./fal-voice-timestamps";

const modelPattern = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i;

export class FalVoiceGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FalVoiceGenerationError";
  }
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FalVoiceGenerationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value as Record<string, unknown>;
}

function safeError(error: unknown): FalVoiceGenerationError {
  if (error instanceof FalVoiceGenerationError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return new FalVoiceGenerationError("FAL_AI_API_KEY를 확인해 주세요.");
    if (error.status === 429) return new FalVoiceGenerationError("fal.ai 사용량 또는 요청 한도에 도달했습니다.");
    if (error.status >= 500) return new FalVoiceGenerationError("fal.ai 음성 서비스가 일시적으로 응답하지 않습니다.");
    return new FalVoiceGenerationError("fal.ai 음성 요청을 처리하지 못했습니다. FAL_VOICE_MODEL과 모델의 입력 지원 범위를 확인해 주세요.");
  }
  return new FalVoiceGenerationError("fal.ai 음성 요청 시간이 초과되었거나 네트워크 연결에 실패했습니다.", { cause: error });
}

export async function generateVoiceWithFal(text: string, input: VoiceGenerationInput) {
  const apiKey = process.env.FAL_AI_API_KEY?.trim();
  if (!apiKey) throw new FalVoiceGenerationError("FAL_AI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.FAL_VOICE_MODEL?.trim();
  if (!model || !modelPattern.test(model)) throw new FalVoiceGenerationError("FAL_VOICE_MODEL에 유효한 fal.ai 음성 모델 ID를 설정해 주세요.");
  const cleanText = text.trim();
  if (!cleanText) throw new FalVoiceGenerationError("전체 대본이 비어 있습니다.");
  if (cleanText.length > 100_000) throw new FalVoiceGenerationError("전체 대본이 음성 생성 허용 길이를 초과했습니다.");

  try {
    const client = createFalClient({ credentials: apiKey });
    const result = await client.subscribe(model, {
      input: { text: cleanText, ...voiceInputSettings(input) },
      mode: "polling",
      pollInterval: 1_000,
      timeout: 5 * 60_000,
    });
    const data = recordAt(result.data, "fal.ai 음성 결과");
    const audio = recordAt(data.audio, "fal.ai 음성 파일");
    const url = typeof audio.url === "string" ? audio.url : "";
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new FalVoiceGenerationError("fal.ai 음성 다운로드 주소가 올바르지 않습니다.");
    }
    const trustedHost = parsedUrl.hostname === "storage.googleapis.com" || parsedUrl.hostname === "fal.media" || parsedUrl.hostname.endsWith(".fal.media");
    if (parsedUrl.protocol !== "https:" || !trustedHost) throw new FalVoiceGenerationError("fal.ai 음성 다운로드 주소가 올바르지 않습니다.");
    return {
      model,
      audio: {
        url: parsedUrl.toString(),
        contentType: typeof audio.content_type === "string" ? audio.content_type : "audio/mpeg",
      },
      timestamps: normalizeFalVoiceTimestamps(data),
    };
  } catch (error) {
    throw safeError(error);
  }
}
