import { after } from "next/server";

import { performMusicGeneration, startMusicGeneration } from "@/lib/server/music-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export const maxDuration = 600;

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/music-runs">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ error: "배경음악 생성 요청이 올바르지 않습니다." }, { status: 400 });
    const requestBody = body as Record<string, unknown>;
    const result = await startMusicGeneration(projectId, requestBody.requestId, requestBody.input);
    if (result.created) after(() => performMusicGeneration(projectId, result.runId, requestBody.input));
    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배경음악 생성을 시작할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

