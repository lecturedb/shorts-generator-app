import { after } from "next/server";

import { performImageGeneration, startImageGeneration } from "@/lib/server/image-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export const maxDuration = 300;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "이미지 생성 요청을 처리할 수 없습니다.";
  const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/image-runs">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const record = body as Record<string, unknown>;
    const result = await startImageGeneration(projectId, record.requestId, record.sceneIds);
    if (result.created) after(() => performImageGeneration(projectId, result.runId, record.sceneIds));
    return Response.json(result, { status: result.status === "실행 중" ? 202 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

