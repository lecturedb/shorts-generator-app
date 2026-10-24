import { cancelFinalRender, getFinalRenderRun, renderProjectSummaries } from "@/lib/server/final-rendering";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "최종 렌더링 상태를 확인할 수 없습니다.";
  const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; runId: string }> }) {
  try {
    const { projectId, runId } = await context.params;
    return Response.json({ ...(await getFinalRenderRun(projectId, runId)), projects: await renderProjectSummaries() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string; runId: string }> }) {
  try {
    const { projectId, runId } = await context.params;
    return Response.json(await cancelFinalRender(projectId, runId), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
