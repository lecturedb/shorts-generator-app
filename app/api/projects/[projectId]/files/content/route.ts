import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { projectFileContentType } from "@/lib/server/project-files";
import {
  ProjectStorageError,
  resolveExistingProjectFilePath,
} from "@/lib/server/project-storage";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "프로젝트 파일을 읽을 수 없습니다.";
  const code = error instanceof ProjectStorageError ? error.code : null;
  const status = code === "READ_FAILED" ? 404 : code === "INVALID_CONFIG" ? 500 : 400;
  return Response.json({ error: message }, { status });
}

function parseByteRange(rangeHeader: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startValue, endValue] = match;
  if (startValue === "" && endValue === "") return null;

  let start: number;
  let end: number;
  if (startValue === "") {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue === "" ? size - 1 : Number(endValue);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/files/content">,
) {
  try {
    const { projectId } = await context.params;
    const relativePath = new URL(request.url).searchParams.get("path");
    if (!relativePath) {
      throw new ProjectStorageError("INVALID_PATH", "조회할 프로젝트 파일 경로가 필요합니다.");
    }

    const contentType = projectFileContentType(relativePath);
    if (!contentType) {
      return Response.json(
        { error: "이 파일 형식은 앱에서 미리보기를 지원하지 않습니다." },
        { status: 415 },
      );
    }

    const filePath = await resolveExistingProjectFilePath(projectId, relativePath);
    if (!filePath) {
      return Response.json(
        { error: "파일이 없습니다. 기존 프로젝트 데이터는 유지되며 복구 또는 재생성이 필요합니다." },
        { status: 404 },
      );
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new ProjectStorageError("INVALID_PATH", "일반 파일만 조회할 수 있습니다.");
    }

    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    };
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, fileStat.size);
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: { ...commonHeaders, "Content-Range": `bytes */${fileStat.size}` },
        });
      }
      const stream = createReadStream(filePath, range);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
        },
      });
    }

    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: { ...commonHeaders, "Content-Length": String(fileStat.size) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
