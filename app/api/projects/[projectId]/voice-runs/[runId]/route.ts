import { getVoiceGenerationRun, voiceProjectSummaries } from "@/lib/server/voice-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[projectId]/voice-runs/[runId]">) {
  try {
    const { projectId, runId } = await context.params;
    return Response.json({ ...(await getVoiceGenerationRun(projectId, runId)), projects: await voiceProjectSummaries() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "더빙 생성 상태를 확인할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
