import { createProject, listProjects } from "@/lib/server/project-management";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "프로젝트 요청을 처리할 수 없습니다.";
  const status = error instanceof ProjectStorageError && error.code === "INVALID_CONFIG" ? 500 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json(await listProjects());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const project = await createProject((body as Record<string, unknown>).name);
    const { projects } = await listProjects();
    return Response.json({ project, projects }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
