import { getMusicGenerationRun, musicProjectSummaries } from "@/lib/server/music-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[projectId]/music-runs/[runId]">) {
  try {
    const { projectId, runId } = await context.params;
    return Response.json({ ...(await getMusicGenerationRun(projectId, runId)), projects: await musicProjectSummaries() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배경음악 생성 상태를 확인할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
