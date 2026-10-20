import "server-only";

import type { ScriptGenerationResult } from "../script-generation-types";
import {
  OpenAIScriptGenerationError,
  parseScriptGenerationInput,
  parseScriptGenerationResult,
} from "../script-generation-validation";

const DEFAULT_MODEL = "gpt-5.4-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 60_000;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OpenAIScriptGenerationError(`${label} 형식이 올바르지 않습니다.`);
  }
  return value as Record<string, unknown>;
}

function extractOutputText(input: unknown): string {
  const response = objectValue(input, "OpenAI 응답");
  if (response.status !== "completed") {
    throw new OpenAIScriptGenerationError("OpenAI가 응답 생성을 완료하지 못했습니다.");
  }
  if (typeof response.output_text === "string" && response.output_text.trim() !== "") {
    return response.output_text;
  }
  if (!Array.isArray(response.output)) {
    throw new OpenAIScriptGenerationError("OpenAI 응답 본문이 없습니다.");
  }
  for (const itemValue of response.output) {
    if (typeof itemValue !== "object" || itemValue === null || Array.isArray(itemValue)) continue;
    const item = itemValue as Record<string, unknown>;
    if (!Array.isArray(item.content)) continue;
    for (const contentValue of item.content) {
      if (typeof contentValue !== "object" || contentValue === null || Array.isArray(contentValue)) continue;
      const content = contentValue as Record<string, unknown>;
      if (content.type === "refusal") {
        throw new OpenAIScriptGenerationError("요청한 주제로는 대본을 생성할 수 없습니다. 주제를 조정해 다시 요청해 주세요.");
      }
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new OpenAIScriptGenerationError("OpenAI 응답에서 생성된 JSON을 찾지 못했습니다.");
}

function apiErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "OPENAI_API_KEY를 확인해 주세요.";
  if (status === 429) return "OpenAI 사용량 또는 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 500) return "OpenAI 서비스가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
  return "OpenAI 요청을 처리하지 못했습니다. 입력과 모델 접근 권한을 확인해 주세요.";
}

export async function generateScriptWithOpenAI(
  rawInput: unknown,
  fetcher: typeof fetch = fetch,
): Promise<{ model: string; result: ScriptGenerationResult }> {
  const input = parseScriptGenerationInput(rawInput);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIScriptGenerationError("OPENAI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.OPENAI_SCRIPT_MODEL?.trim() || DEFAULT_MODEL;
  const schema = {
    type: "object",
    properties: {
      script: { type: "string" },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            order: { type: "integer" },
            startSeconds: { type: "number" },
            durationSeconds: { type: "number" },
            narration: { type: "string" },
            visual: {
              type: "string",
              description: "장면에서 보일 인물, 사물, 배경, 구도를 자연스러운 한국어로 설명한 문장",
            },
            imagePrompt: {
              type: "string",
              description: "이미지 생성 모델에 전달할 영어 프롬프트",
            },
          },
          required: ["order", "startSeconds", "durationSeconds", "narration", "visual", "imagePrompt"],
          additionalProperties: false,
        },
      },
    },
    required: ["script", "scenes"],
    additionalProperties: false,
  };
  const body = {
    model,
    store: false,
    instructions: [
      "당신은 세로형 숏폼 영상의 한국어 대본과 이미지 중심 장면 구성 전문가입니다.",
      "전체 대본은 장면별 narration을 순서대로 한 칸씩 띄어 이어 붙인 문자열과 정확히 같아야 합니다.",
      "각 장면의 visual은 시청자가 보게 될 인물, 사물, 배경, 구도를 자연스러운 한국어로 구체적으로 설명하세요. 영어로 작성하지 마세요.",
      "각 이미지 프롬프트는 이미지 생성 모델에 바로 전달할 수 있는 영어 문장으로 작성하고, vertical 9:16 composition과 no text를 명시하세요.",
      "영상 움직임, 영상 프롬프트, 영상 API 설정은 만들지 마세요.",
      "장면 시작 시간은 0초부터 앞 장면 종료 시간에 맞춰 이어지고, 모든 장면 길이의 합은 목표 길이와 정확히 같아야 합니다.",
    ].join("\n"),
    input: `주제: ${input.topic}\n목표 길이: ${input.targetDurationSeconds}초\n장면 수: ${input.sceneCount}개\n말투: ${input.tone}`,
    text: {
      format: {
        type: "json_schema",
        name: "shorts_script_and_image_scenes",
        strict: true,
        schema,
      },
    },
    max_output_tokens: 12_000,
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const error = new OpenAIScriptGenerationError(apiErrorMessage(response.status));
        if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
          lastError = error;
          continue;
        }
        throw error;
      }
      const outputText = extractOutputText(await response.json() as unknown);
      let parsed: unknown;
      try {
        parsed = JSON.parse(outputText) as unknown;
      } catch (error) {
        throw new OpenAIScriptGenerationError("OpenAI가 올바른 JSON을 반환하지 않았습니다.", { cause: error });
      }
      return { model, result: parseScriptGenerationResult(parsed, input) };
    } catch (error) {
      if (error instanceof OpenAIScriptGenerationError) throw error;
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
    }
  }
  throw new OpenAIScriptGenerationError("OpenAI 요청 시간이 초과되었거나 네트워크 연결에 실패했습니다.", { cause: lastError });
}
