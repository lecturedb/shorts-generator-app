import { after } from "next/server";

import { performVideoPromptGeneration, startVideoPromptGeneration } from "@/lib/server/video-prompt-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export const maxDuration = 120;

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/video-prompt-runs">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const result = await startVideoPromptGeneration(projectId, (body as Record<string, unknown>).requestId);
    if (result.created) after(() => performVideoPromptGeneration(projectId, result.runId));
    return Response.json(result, { status: result.status === "실행 중" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "영상 프롬프트 생성 요청을 처리할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

