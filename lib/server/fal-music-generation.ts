import "server-only";

import { ApiError, createFalClient } from "@fal-ai/client";

import type { MusicGenerationInput } from "../music-generation-types";
import { falMusicInput } from "../music-generation-validation";

const modelPattern = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i;

export class FalMusicGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FalMusicGenerationError";
  }
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new FalMusicGenerationError(`${label} 형식이 올바르지 않습니다.`);
  return value as Record<string, unknown>;
}

function safeError(error: unknown) {
  if (error instanceof FalMusicGenerationError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return new FalMusicGenerationError("FAL_AI_API_KEY를 확인해 주세요.");
    if (error.status === 429) return new FalMusicGenerationError("fal.ai 사용량 또는 요청 한도에 도달했습니다.");
    if (error.status >= 500) return new FalMusicGenerationError("fal.ai 음악 서비스가 일시적으로 응답하지 않습니다.");
    return new FalMusicGenerationError("fal.ai 음악 요청을 처리하지 못했습니다. FAL_MUSIC_MODEL과 모델의 입력 지원 범위를 확인해 주세요.");
  }
  return new FalMusicGenerationError("fal.ai 음악 요청 시간이 초과되었거나 네트워크 연결에 실패했습니다.", { cause: error });
}

export async function generateMusicWithFal(input: MusicGenerationInput, targetDurationSeconds: number) {
  const apiKey = process.env.FAL_AI_API_KEY?.trim();
  if (!apiKey) throw new FalMusicGenerationError("FAL_AI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.FAL_MUSIC_MODEL?.trim();
  if (!model || !modelPattern.test(model)) throw new FalMusicGenerationError("FAL_MUSIC_MODEL에 유효한 fal.ai 음악 모델 ID를 설정해 주세요.");
  try {
    const client = createFalClient({ credentials: apiKey });
    const result = await client.subscribe(model, {
      input: falMusicInput(model, input, targetDurationSeconds),
      mode: "polling",
      pollInterval: 1_000,
      timeout: 10 * 60_000,
    });
    const data = recordAt(result.data, "fal.ai 음악 결과");
    const rawAudio = data.audio ?? data.audio_file;
    const audio = typeof rawAudio === "string" ? { url: rawAudio } : recordAt(rawAudio, "fal.ai 음악 파일");
    const url = typeof audio.url === "string" ? audio.url : "";
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new FalMusicGenerationError("fal.ai 음악 다운로드 주소가 올바르지 않습니다.");
    }
    const trustedHost = parsedUrl.hostname === "storage.googleapis.com" || parsedUrl.hostname === "fal.media" || parsedUrl.hostname.endsWith(".fal.media");
    if (parsedUrl.protocol !== "https:" || !trustedHost) throw new FalMusicGenerationError("fal.ai 음악 다운로드 주소가 올바르지 않습니다.");
    return {
      model,
      audio: { url: parsedUrl.toString(), contentType: typeof audio.content_type === "string" ? audio.content_type : null },
      durationSeconds: typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : targetDurationSeconds,
    };
  } catch (error) {
    throw safeError(error);
  }
}

