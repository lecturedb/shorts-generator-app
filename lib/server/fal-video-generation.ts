import "server-only";

import { createFalClient, ApiError } from "@fal-ai/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { projectFileContentType } from "./project-files-core";

const modelPattern = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i;

export class FalVideoGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FalVideoGenerationError";
  }
}

type FalVideoResult = {
  model: string;
  video: {
    url: string;
    contentType: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  };
};

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FalVideoGenerationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value as Record<string, unknown>;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function safeError(error: unknown): FalVideoGenerationError {
  if (error instanceof FalVideoGenerationError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403)
      return new FalVideoGenerationError("FAL_AI_API_KEY를 확인해 주세요.");
    if (error.status === 429)
      return new FalVideoGenerationError(
        "fal.ai 사용량 또는 요청 한도에 도달했습니다.",
      );
    if (error.status >= 500)
      return new FalVideoGenerationError(
        "fal.ai 영상 서비스가 일시적으로 응답하지 않습니다.",
      );
    return new FalVideoGenerationError(
      "fal.ai 영상 요청을 처리하지 못했습니다. FAL_VIDEO_MODEL과 모델의 입력 지원 범위를 확인해 주세요.",
    );
  }
  return new FalVideoGenerationError(
    "fal.ai 영상 요청 시간이 초과되었거나 네트워크 연결에 실패했습니다.",
    { cause: error },
  );
}

export async function generateVideoWithFal({
  prompt,
  durationSeconds,
  startImagePath,
  endImagePath,
}: {
  prompt: string;
  durationSeconds: number;
  startImagePath: string;
  endImagePath?: string;
}): Promise<FalVideoResult> {
  const apiKey = process.env.FAL_AI_API_KEY?.trim();
  if (!apiKey)
    throw new FalVideoGenerationError("FAL_AI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.FAL_VIDEO_MODEL?.trim();
  if (!model || !modelPattern.test(model)) {
    throw new FalVideoGenerationError(
      "FAL_VIDEO_MODEL에 유효한 fal.ai 영상 모델 ID를 설정해 주세요.",
    );
  }
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt)
    throw new FalVideoGenerationError("장면 영상 프롬프트가 비어 있습니다.");

  try {
    const client = createFalClient({ credentials: apiKey });
    const upload = async (filePath: string) => {
      const bytes = await readFile(filePath);
      const contentType = projectFileContentType(path.basename(filePath));
      if (!contentType?.startsWith("image/"))
        throw new FalVideoGenerationError(
          "참조 이미지 파일 형식이 올바르지 않습니다.",
        );
      return client.storage.upload(new Blob([bytes], { type: contentType }), {
        lifecycle: { expiresIn: "1d" },
      });
    };
    const startImageUrl = await upload(startImagePath);
    const endImageUrl = endImagePath ? await upload(endImagePath) : undefined;
    const result = await client.subscribe(model, {
      input: {
        prompt: cleanPrompt,
        start_image_url: startImageUrl,
        ...(endImageUrl ? { end_image_url: endImageUrl } : {}),
        duration: durationSeconds,
        generate_audio: false,
        // audio: false,
      },
      mode: "polling",
      pollInterval: 1_000,
      timeout: 10 * 60_000,
    });
    const data = recordAt(result.data, "fal.ai 영상 결과");
    const video = recordAt(data.video, "fal.ai 영상 파일");
    const url = typeof video.url === "string" ? video.url : "";
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new FalVideoGenerationError(
        "fal.ai 영상 다운로드 주소가 올바르지 않습니다.",
      );
    }
    const trustedHost =
      parsedUrl.hostname === "storage.googleapis.com" ||
      parsedUrl.hostname === "fal.media" ||
      parsedUrl.hostname.endsWith(".fal.media");
    if (parsedUrl.protocol !== "https:" || !trustedHost)
      throw new FalVideoGenerationError(
        "fal.ai 영상 다운로드 주소가 올바르지 않습니다.",
      );
    return {
      model,
      video: {
        url: parsedUrl.toString(),
        contentType:
          typeof video.content_type === "string"
            ? video.content_type
            : "video/mp4",
        width: numberField(video.width),
        height: numberField(video.height),
        durationSeconds:
          numberField(video.duration) ?? numberField(data.duration),
      },
    };
  } catch (error) {
    throw safeError(error);
  }
}
