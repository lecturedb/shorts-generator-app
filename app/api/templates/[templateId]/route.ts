import { deleteTemplate, listTemplates, updateTemplate } from "@/lib/server/template-management";
import { ProjectStorageError } from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "템플릿 요청을 처리할 수 없습니다." }, { status: error instanceof ProjectStorageError && error.code === "INVALID_CONFIG" ? 500 : 400 });
}

export async function PUT(request: Request, context: RouteContext<"/api/templates/[templateId]">) {
  try {
    const [{ templateId }, body] = await Promise.all([context.params, request.json() as Promise<unknown>]);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ProjectStorageError("WRITE_FAILED", "요청 본문이 올바르지 않습니다.");
    const values = body as Record<string, unknown>;
    const template = await updateTemplate(templateId, values.name, values.project);
    return Response.json({ template, templates: await listTemplates() });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/templates/[templateId]">) {
  try {
    const { templateId } = await context.params;
    await deleteTemplate(templateId);
    return Response.json({ deletedTemplateId: templateId, templates: await listTemplates() });
  } catch (error) { return errorResponse(error); }
}
