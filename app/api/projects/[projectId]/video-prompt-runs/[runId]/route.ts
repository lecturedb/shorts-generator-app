import { getVideoPromptGenerationRun } from "@/lib/server/video-prompt-generation";
import { imageProjectSummaries } from "@/lib/server/image-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[projectId]/video-prompt-runs/[runId]">) {
  try {
    const { projectId, runId } = await context.params;
    return Response.json({ ...(await getVideoPromptGenerationRun(projectId, runId)), projects: await imageProjectSummaries() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "영상 프롬프트 생성 상태를 확인할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
