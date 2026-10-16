import { deleteProject, listProjects, renameProject, saveManagedProject } from "@/lib/server/project-management";
import { loadProjectDocument, ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "프로젝트 요청을 처리할 수 없습니다.";
  const code = error instanceof ProjectStorageError ? error.code : null;
  const status = code === "READ_FAILED" ? 404 : code === "INVALID_CONFIG" ? 500 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext<"/api/projects/[projectId]">) {
  try {
    const { projectId } = await context.params;
    return Response.json({ project: await loadProjectDocument(projectId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext<"/api/projects/[projectId]">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const record = body as Record<string, unknown>;
    const action = record.action;
    const project = action === "rename"
      ? await renameProject(projectId, record.name)
      : action === "save"
        ? await saveManagedProject(projectId, record.project)
        : (() => { throw new ProjectStorageError("WRITE_FAILED", "지원하지 않는 저장 작업입니다."); })();
    const { projects } = await listProjects();
    return Response.json({ project, projects });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/projects/[projectId]">) {
  try {
    const { projectId } = await context.params;
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "삭제 확인 정보가 없습니다.");
    return Response.json(await deleteProject(projectId, (body as Record<string, unknown>).confirmProjectId));
  } catch (error) {
    return errorResponse(error);
  }
}
