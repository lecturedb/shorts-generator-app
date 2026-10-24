import { after } from "next/server";

import { getRenderRuntimeStatus, performFinalRender, startFinalRender } from "@/lib/server/final-rendering";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function GET() {
  return Response.json(await getRenderRuntimeStatus());
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json({ error: "최종 렌더링 요청이 올바르지 않습니다." }, { status: 400 });
    }
    const result = await startFinalRender(projectId, (body as Record<string, unknown>).requestId);
    if (result.created) after(() => performFinalRender(projectId, result.runId));
    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "최종 렌더링을 시작할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
