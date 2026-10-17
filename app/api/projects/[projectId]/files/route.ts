import { listProjectFileEntries } from "@/lib/server/project-files";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "프로젝트 파일 목록을 읽을 수 없습니다.";
  const code = error instanceof ProjectStorageError ? error.code : null;
  const status = code === "READ_FAILED" ? 404 : code === "INVALID_CONFIG" ? 500 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/files">,
) {
  try {
    const { projectId } = await context.params;
    return Response.json({ files: await listProjectFileEntries(projectId) });
  } catch (error) {
    return errorResponse(error);
  }
}
