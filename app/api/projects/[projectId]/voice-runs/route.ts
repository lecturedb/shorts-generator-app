import { after } from "next/server";

import { performVoiceGeneration, startVoiceGeneration } from "@/lib/server/voice-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/voice-runs">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "더빙 생성 요청이 올바르지 않습니다." }, { status: 400 });
    }
    const requestBody = body as Record<string, unknown>;
    const result = await startVoiceGeneration(projectId, requestBody.requestId, requestBody.input);
    if (result.created) after(() => performVoiceGeneration(projectId, result.runId, requestBody.input));
    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "더빙 생성을 시작할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
