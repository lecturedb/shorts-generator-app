import "server-only";

const QUEUE_BASE_URL = "https://queue.fal.run";
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 300;

export class FalImageGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FalImageGenerationError";
  }
}

type FalGeneratedImage = {
  url: string;
  contentType: string;
  width?: number;
  height?: number;
};

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FalImageGenerationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value as Record<string, unknown>;
}

function trustedQueueUrl(value: string) {
  try {
    return new URL(value).origin === QUEUE_BASE_URL;
  } catch {
    return false;
  }
}

async function falRequest(url: string, apiKey: string, init: RequestInit, fetcher: typeof fetch) {
  const attempts = init.method === "GET" ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        ...init,
        headers: {
          Authorization: `Key ${apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response;
      if (response.status === 401 || response.status === 403) throw new FalImageGenerationError("FAL_AI_API_KEY를 확인해 주세요.");
      if (response.status === 429) {
        const error = new FalImageGenerationError("fal.ai 사용량 또는 요청 한도에 도달했습니다.");
        if (attempt < attempts) { lastError = error; continue; }
        throw error;
      }
      if (response.status >= 500) {
        const error = new FalImageGenerationError("fal.ai 서비스가 일시적으로 응답하지 않습니다.");
        if (attempt < attempts) { lastError = error; continue; }
        throw error;
      }
      throw new FalImageGenerationError("fal.ai 이미지 요청을 처리하지 못했습니다. 모델과 입력값을 확인해 주세요.");
    } catch (error) {
      if (error instanceof FalImageGenerationError) throw error;
      lastError = error;
      if (attempt === attempts) break;
    }
  }
  throw new FalImageGenerationError("fal.ai 요청 시간이 초과되었거나 네트워크 연결에 실패했습니다.", { cause: lastError });
}

export async function generateImageWithFal(
  prompt: string,
  fetcher: typeof fetch = fetch,
): Promise<{ model: string; image: FalGeneratedImage }> {
  const apiKey = process.env.FAL_AI_API_KEY?.trim();
  if (!apiKey) throw new FalImageGenerationError("FAL_AI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.FAL_IMAGE_MODEL?.trim();
  if (!model || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/i.test(model)) {
    throw new FalImageGenerationError("FAL_IMAGE_MODEL에 유효한 fal.ai 모델 ID를 설정해 주세요.");
  }
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new FalImageGenerationError("장면 이미지 프롬프트가 비어 있습니다.");

  const submitted = recordAt(await (await falRequest(
    `${QUEUE_BASE_URL}/${model}`,
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        prompt: cleanPrompt,
        image_size: "portrait_16_9",
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png",
      }),
    },
    fetcher,
  )).json() as unknown, "fal.ai 제출 응답");
  const statusUrl = typeof submitted.status_url === "string" ? submitted.status_url : null;
  const responseUrl = typeof submitted.response_url === "string" ? submitted.response_url : null;
  if (!statusUrl || !responseUrl || !trustedQueueUrl(statusUrl) || !trustedQueueUrl(responseUrl)) {
    throw new FalImageGenerationError("fal.ai 제출 응답에 상태 조회 주소가 없습니다.");
  }

  let completed = false;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const status = recordAt(await (await falRequest(statusUrl, apiKey, { method: "GET" }, fetcher)).json() as unknown, "fal.ai 상태 응답");
    if (status.status === "COMPLETED") {
      if (typeof status.error === "string" && status.error) throw new FalImageGenerationError("fal.ai가 이미지 생성을 완료하지 못했습니다.");
      completed = true;
      break;
    }
    if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
      throw new FalImageGenerationError("fal.ai 이미지 작업 상태를 확인할 수 없습니다.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (!completed) throw new FalImageGenerationError("fal.ai 이미지 생성 대기 시간이 초과되었습니다.");

  const result = recordAt(await (await falRequest(responseUrl, apiKey, { method: "GET" }, fetcher)).json() as unknown, "fal.ai 결과");
  if (!Array.isArray(result.images) || result.images.length === 0) throw new FalImageGenerationError("fal.ai 결과에 생성 이미지가 없습니다.");
  const image = recordAt(result.images[0], "fal.ai 이미지 결과");
  let imageUrl: URL;
  try {
    imageUrl = new URL(typeof image.url === "string" ? image.url : "");
  } catch {
    throw new FalImageGenerationError("fal.ai 이미지 다운로드 주소가 올바르지 않습니다.");
  }
  const trustedMediaHost = imageUrl.hostname === "storage.googleapis.com" || imageUrl.hostname === "fal.media" || imageUrl.hostname.endsWith(".fal.media");
  if (imageUrl.protocol !== "https:" || !trustedMediaHost) throw new FalImageGenerationError("fal.ai 이미지 다운로드 주소가 올바르지 않습니다.");
  return {
    model,
    image: {
      url: imageUrl.toString(),
      contentType: typeof image.content_type === "string" ? image.content_type : "image/png",
      width: typeof image.width === "number" && Number.isInteger(image.width) ? image.width : undefined,
      height: typeof image.height === "number" && Number.isInteger(image.height) ? image.height : undefined,
    },
  };
}
