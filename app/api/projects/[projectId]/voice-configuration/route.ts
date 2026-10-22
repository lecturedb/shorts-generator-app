import { updateVoiceConfiguration, voiceProjectSummaries } from "@/lib/server/voice-generation";
import { ProjectStorageError } from "@/lib/server/project-storage";

export async function PATCH(request: Request, context: RouteContext<"/api/projects/[projectId]/voice-configuration">) {
  try {
    const { projectId } = await context.params;
    const project = await updateVoiceConfiguration(projectId, await request.json() as unknown);
    return Response.json({ project, projects: await voiceProjectSummaries() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "더빙 설정을 저장할 수 없습니다.";
    const status = error instanceof ProjectStorageError && error.code === "READ_FAILED" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
