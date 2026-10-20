import { getScriptGenerationRun, projectSummaries } from "@/lib/server/script-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "대본 생성 상태를 확인할 수 없습니다.";
  const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/script-runs/[runId]">,
) {
  try {
    const { projectId, runId } = await context.params;
    const result = await getScriptGenerationRun(projectId, runId);
    return Response.json({ ...result, projects: await projectSummaries() });
  } catch (error) {
    return errorResponse(error);
  }
}
