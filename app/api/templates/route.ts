import { createTemplate, listTemplates } from "@/lib/server/template-management";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "템플릿 요청을 처리할 수 없습니다." }, { status: error instanceof ProjectStorageError && error.code === "INVALID_CONFIG" ? 500 : 400 });
}

export async function GET() {
  try { return Response.json({ templates: await listTemplates() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const values = body as Record<string, unknown>;
    const template = await createTemplate(values.name, values.project);
    return Response.json({ template, templates: await listTemplates() }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
