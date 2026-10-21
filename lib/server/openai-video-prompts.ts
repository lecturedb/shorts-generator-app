import "server-only";

import type { ProjectDocument } from "../project-schema";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} 형식이 올바르지 않습니다.`);
  return value as Record<string, unknown>;
}

function outputText(value: unknown) {
  const response = recordAt(value, "OpenAI 응답");
  if (response.status !== "completed") throw new Error("OpenAI가 영상 프롬프트 생성을 완료하지 못했습니다.");
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  if (!Array.isArray(response.output)) throw new Error("OpenAI 응답 본문이 없습니다.");
  for (const item of response.output) {
    if (typeof item !== "object" || item === null || Array.isArray(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content === "object" && content !== null && !Array.isArray(content)) {
        const part = content as Record<string, unknown>;
        if (part.type === "output_text" && typeof part.text === "string") return part.text;
      }
    }
  }
  throw new Error("OpenAI 응답에서 영상 프롬프트 JSON을 찾지 못했습니다.");
}

export async function generateVideoPromptsWithOpenAI(project: ProjectDocument, fetcher: typeof fetch = fetch) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.OPENAI_SCRIPT_MODEL?.trim() || DEFAULT_MODEL;
  const targets = project.scenes.filter((scene) => scene.video.enabled);
  if (targets.length === 0) throw new Error("영상 생성 대상으로 선택한 장면이 없습니다.");
  const plans = targets.map((scene) => {
    if (!scene.video.startImageAssetId) throw new Error(`${scene.order}번 장면의 시작 이미지가 없습니다.`);
    const startAsset = project.assets.find((asset) => asset.id === scene.video.startImageAssetId);
    const endAsset = scene.video.endImageAssetId ? project.assets.find((asset) => asset.id === scene.video.endImageAssetId) : null;
    const startScene = project.scenes.find((candidate) => candidate.id === startAsset?.sceneId);
    const endScene = project.scenes.find((candidate) => candidate.id === endAsset?.sceneId);
    return {
      sceneId: scene.id,
      order: scene.order,
      narration: scene.narration,
      intendedVisual: scene.visual,
      startImageVisual: startScene?.visual ?? scene.visual,
      endImageVisual: endScene?.visual ?? null,
      mode: scene.video.mode,
    };
  });
  const sceneIds = plans.map((plan) => plan.sceneId);
  const response = await fetcher(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        "Create concise English image-to-video motion prompts for vertical short-form scenes.",
        "Describe only camera movement, subject motion, environmental motion, and continuity from the supplied start image to the optional end image.",
        "Do not invent text overlays, dialogue, sound, duration, model parameters, or additional scenes.",
        "Return exactly one prompt for each supplied sceneId.",
      ].join("\n"),
      input: JSON.stringify(plans),
      text: {
        format: {
          type: "json_schema",
          name: "selected_scene_video_prompts",
          strict: true,
          schema: {
            type: "object",
            properties: {
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: { sceneId: { type: "string", enum: sceneIds }, prompt: { type: "string" } },
                  required: ["sceneId", "prompt"],
                  additionalProperties: false,
                },
              },
            },
            required: ["scenes"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 4_000,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("OPENAI_API_KEY를 확인해 주세요.");
    if (response.status === 429) throw new Error("OpenAI 사용량 또는 요청 한도에 도달했습니다.");
    throw new Error("OpenAI 영상 프롬프트 요청을 처리하지 못했습니다.");
  }
  const parsed = recordAt(JSON.parse(outputText(await response.json() as unknown)) as unknown, "영상 프롬프트");
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== targets.length) throw new Error("선택한 장면 수와 영상 프롬프트 수가 일치하지 않습니다.");
  const prompts = new Map<string, string>();
  for (const value of parsed.scenes) {
    const item = recordAt(value, "영상 프롬프트 항목");
    if (typeof item.sceneId !== "string" || !sceneIds.includes(item.sceneId) || prompts.has(item.sceneId)) throw new Error("영상 프롬프트 장면 ID가 올바르지 않습니다.");
    if (typeof item.prompt !== "string" || !item.prompt.trim() || item.prompt.length > 4_000) throw new Error("영상 프롬프트 내용이 올바르지 않습니다.");
    prompts.set(item.sceneId, item.prompt.trim());
  }
  return { model, prompts };
}

