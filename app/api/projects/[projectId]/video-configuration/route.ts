import { updateVideoConfiguration, videoProjectSummaries } from "@/lib/server/video-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function PATCH(request: Request, context: RouteContext<"/api/projects/[projectId]/video-configuration">) {
  try {
    const { projectId } = await context.params;
    const project = await updateVideoConfiguration(projectId, await request.json() as unknown);
    return Response.json({ project, projects: await videoProjectSummaries() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "영상 설정을 저장할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
