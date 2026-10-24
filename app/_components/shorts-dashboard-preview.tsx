"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { ProjectDocument } from "@/lib/project-schema";
import { Icon, type DashboardFile } from "./shorts-dashboard-shared";

export function FileProblem({
  file,
  message,
}: {
  file: DashboardFile;
  message?: string;
}) {
  const recoveryAction =
    file.recoveryAction ??
    (message
      ? "원본 파일을 복구하거나 해당 파일을 만든 제작 단계를 다시 실행하세요."
      : undefined);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Icon name="document" />
        </span>
        <div>
          <p className="text-sm font-extrabold">
            미리보기를 표시할 수 없습니다
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            {message ?? file.issue ?? "파일을 확인할 수 없습니다."}
          </p>
        </div>
      </div>
      {recoveryAction && (
        <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
          복구 방법: {recoveryAction}
        </p>
      )}
    </div>
  );
}

export function JsonReadablePreview({
  project,
  value,
  isProjectDocument,
}: {
  project: ProjectDocument;
  value: unknown;
  isProjectDocument: boolean;
}) {
  if (isProjectDocument) {
    return (
      <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-violet-600">프로젝트</p>
          <p className="mt-1 font-extrabold text-slate-950">
            {project.project.name}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {project.project.description || "프로젝트 설명이 없습니다."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-400">대본</p>
            <p className="mt-1 font-bold text-slate-800">
              {project.script.topic || "작성 전"}
            </p>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
              {project.script.text || "내레이션이 없습니다."}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-400">구성</p>
            <p className="mt-1 font-bold text-slate-800">
              장면 {project.scenes.length}개 · 자산 {project.assets.length}개
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {project.project.settings.width} ×{" "}
              {project.project.settings.height} ·{" "}
              {project.project.settings.targetDurationSeconds}초
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (typeof value !== "object" || value === null) {
    return (
      <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        {String(value)}
      </p>
    );
  }
  const entries = Object.entries(value).slice(0, 12);
  return (
    <dl className="grid grid-cols-[minmax(90px,0.35fr)_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-2xl bg-slate-50 p-4 text-xs">
      {entries.map(([key, entryValue]) => (
        <div key={key} className="contents">
          <dt className="truncate font-bold text-slate-500">{key}</dt>
          <dd className="wrap-break-word font-semibold text-slate-800">
            {typeof entryValue === "object"
              ? Array.isArray(entryValue)
                ? `${entryValue.length}개 항목`
                : "객체"
              : String(entryValue)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PreviewVisual({
  file,
  project,
}: {
  file: DashboardFile;
  project: ProjectDocument;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [jsonView, setJsonView] = useState<"readable" | "raw">("readable");
  const [jsonCopyStatus, setJsonCopyStatus] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const [expandedVideoIndex, setExpandedVideoIndex] = useState(0);
  const contentUrl = `/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(file.relativePath)}`;
  const mediaAspectRatio =
    file.width && file.height ? `${file.width} / ${file.height}` : "16 / 9";
  const sceneImages = project.scenes.flatMap((scene) => {
    const asset = project.assets.find(
      (candidate) => candidate.id === scene.selectedImageAssetId,
    );
    return asset
      ? [{ order: scene.order, label: asset.label, path: asset.relativePath }]
      : [];
  });
  const expandedImage = sceneImages[expandedImageIndex] ?? {
    order: null,
    label: file.label,
    path: file.relativePath,
  };
  const expandedImageUrl = `/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(expandedImage.path)}`;
  const selectedSceneVideos = project.scenes.flatMap((scene) => {
    const asset = project.assets.find(
      (candidate) => candidate.id === scene.video.selectedAssetId,
    );
    return asset
      ? [{ order: scene.order, label: asset.label, path: asset.relativePath }]
      : [];
  });
  const isFinalOutput = project.assets.some(
    (asset) => asset.id === file.id && asset.role === "final-output",
  );
  const sceneVideos = isFinalOutput
    ? [{ order: null, label: file.label, path: file.relativePath }]
    : selectedSceneVideos.some((video) => video.path === file.relativePath)
      ? selectedSceneVideos
      : [
          { order: null, label: file.label, path: file.relativePath },
          ...selectedSceneVideos,
        ];
  const expandedVideo = sceneVideos[expandedVideoIndex] ?? {
    order: null,
    label: file.label,
    path: file.relativePath,
  };
  const expandedVideoUrl = `/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(expandedVideo.path)}`;

  useEffect(() => {
    if (!imageExpanded && !videoExpanded) return;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousRootOverscroll =
      document.documentElement.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousLeft = document.body.style.left;
    const previousRight = document.body.style.right;
    const previousWidth = document.body.style.width;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageExpanded(false);
        setVideoExpanded(false);
      }
    };
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.right = "0";
    document.body.style.width = "100%";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.documentElement.style.overflow = previousRootOverflow;
      document.documentElement.style.overscrollBehavior =
        previousRootOverscroll;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      document.body.style.width = previousWidth;
      window.scrollTo(scrollX, scrollY);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageExpanded, videoExpanded]);

  useEffect(() => {
    if (
      file.status !== "available" ||
      (file.kind !== "json" && file.kind !== "text")
    )
      return;

    const controller = new AbortController();
    fetch(contentUrl, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: unknown;
          } | null;
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "파일 내용을 읽을 수 없습니다.",
          );
        }
        return response.text();
      })
      .then(setTextContent)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setTextError(
          caught instanceof Error
            ? caught.message
            : "파일 내용을 읽을 수 없습니다.",
        );
      });
    return () => controller.abort();
  }, [contentUrl, file.kind, file.status]);

  if (file.status !== "available") return <FileProblem file={file} />;
  if (mediaError) return <FileProblem file={file} message={mediaError} />;

  if (file.kind === "image") {
    return (
      <>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
          <Image
            src={contentUrl}
            alt={`${file.label} 미리보기`}
            fill
            unoptimized
            sizes="(max-width: 1024px) 100vw, 390px"
            className="object-contain"
            onError={() =>
              setMediaError(
                "이미지 파일이 손상되었거나 브라우저에서 해석할 수 없습니다.",
              )
            }
          />
          <button
            type="button"
            onClick={() => {
              const selectedIndex = sceneImages.findIndex(
                (image) => image.path === file.relativePath,
              );
              setExpandedImageIndex(selectedIndex >= 0 ? selectedIndex : 0);
              setImageExpanded(true);
            }}
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950/70 text-white shadow-lg backdrop-blur transition hover:bg-slate-950/90"
            aria-label={`${file.label} 크게 보기`}
            title="크게 보기"
          >
            <Icon name="expand" className="h-4 w-4" />
          </button>
        </div>
        {imageExpanded &&
          createPortal(
            <div
              className="fixed inset-0 z-100 flex items-center justify-center overscroll-none bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={`${file.label} 확대 미리보기`}
              onClick={() => setImageExpanded(false)}
            >
              <button
                type="button"
                onClick={() => setImageExpanded(false)}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6 sm:top-6"
                aria-label="확대 미리보기 닫기"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
              <div
                className="flex h-full min-h-0 w-full max-w-6xl flex-col gap-3"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="relative min-h-0 flex-1">
                  <Image
                    src={expandedImageUrl}
                    alt={`${expandedImage.label} 확대 미리보기`}
                    fill
                    unoptimized
                    sizes="100vw"
                    className="object-contain"
                  />
                  {sceneImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedImageIndex((current) =>
                            (current - 1 + sceneImages.length) %
                            sceneImages.length,
                          )
                        }
                        className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition hover:bg-slate-950/85"
                        aria-label="이전 장면 이미지"
                      >
                        <Icon name="chevron" className="h-5 w-5 rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedImageIndex(
                            (current) => (current + 1) % sceneImages.length,
                          )
                        }
                        className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition hover:bg-slate-950/85"
                        aria-label="다음 장면 이미지"
                      >
                        <Icon name="chevron" className="h-5 w-5 -rotate-90" />
                      </button>
                    </>
                  )}
                </div>
                {sceneImages.length > 0 && (
                  <div className="flex shrink-0 justify-center gap-2 overflow-x-auto py-1">
                    {sceneImages.map((image, index) => (
                      <button
                        key={image.path}
                        type="button"
                        onClick={() => setExpandedImageIndex(index)}
                        className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900 transition ${index === expandedImageIndex ? "border-violet-400" : "border-white/20 opacity-70 hover:opacity-100"}`}
                        aria-label={`${image.order}번 장면 이미지 보기`}
                        aria-pressed={index === expandedImageIndex}
                      >
                        <Image
                          src={`/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(image.path)}`}
                          alt=""
                          fill
                          unoptimized
                          sizes="48px"
                          className="object-cover"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-slate-950/75 py-0.5 text-[10px] font-bold text-white">
                          {image.order}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }
  if (file.kind === "video") {
    return (
      <>
        <div
          className="relative mx-auto w-full overflow-hidden rounded-2xl bg-slate-950"
          style={{ aspectRatio: mediaAspectRatio }}
        >
          <video
            key={contentUrl}
            controls
            preload="metadata"
            playsInline
            className="h-full w-full object-contain"
            onError={() =>
              setMediaError(
                "영상 파일이 손상되었거나 브라우저가 코덱을 지원하지 않습니다.",
              )
            }
          >
            <source src={contentUrl} />
            브라우저에서 영상 재생을 지원하지 않습니다.
          </video>
          <button
            type="button"
            onClick={() => {
              const selectedIndex = sceneVideos.findIndex(
                (video) => video.path === file.relativePath,
              );
              setExpandedVideoIndex(selectedIndex >= 0 ? selectedIndex : 0);
              setVideoExpanded(true);
            }}
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950/70 text-white shadow-lg backdrop-blur transition hover:bg-slate-950/90"
            aria-label={`${file.label} 크게 보기`}
            title="크게 보기"
          >
            <Icon name="expand" className="h-4 w-4" />
          </button>
        </div>
        {videoExpanded &&
          createPortal(
            <div
              className="fixed inset-0 z-100 flex items-center justify-center overscroll-none bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={`${file.label} 확대 미리보기`}
              onClick={() => setVideoExpanded(false)}
            >
              <button
                type="button"
                onClick={() => setVideoExpanded(false)}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6 sm:top-6"
                aria-label="영상 확대 미리보기 닫기"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
              <div
                className="flex h-full min-h-0 w-full max-w-6xl flex-col gap-3"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="relative flex min-h-0 flex-1 items-center justify-center">
                  <video
                    key={`expanded-${expandedVideoUrl}`}
                    controls
                    autoPlay
                    preload="auto"
                    playsInline
                    className="max-h-full max-w-full rounded-2xl bg-black object-contain shadow-2xl"
                    onError={() =>
                      setMediaError(
                        "영상 파일이 손상되었거나 브라우저가 코덱을 지원하지 않습니다.",
                      )
                    }
                  >
                    <source src={expandedVideoUrl} />
                    브라우저에서 영상 재생을 지원하지 않습니다.
                  </video>
                  {sceneVideos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVideoIndex((current) =>
                            (current - 1 + sceneVideos.length) %
                            sceneVideos.length,
                          )
                        }
                        className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition hover:bg-slate-950/85"
                        aria-label="이전 장면 영상"
                      >
                        <Icon name="chevron" className="h-5 w-5 rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedVideoIndex(
                            (current) => (current + 1) % sceneVideos.length,
                          )
                        }
                        className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/65 text-white shadow-lg transition hover:bg-slate-950/85"
                        aria-label="다음 장면 영상"
                      >
                        <Icon name="chevron" className="h-5 w-5 -rotate-90" />
                      </button>
                    </>
                  )}
                </div>
                <p className="shrink-0 text-center text-xs font-bold text-white">
                  {expandedVideo.order === null
                    ? expandedVideo.label
                    : `${expandedVideo.order}번 장면 · ${expandedVideo.label}`}
                </p>
                <div className="flex shrink-0 justify-center gap-2 overflow-x-auto py-1">
                  {sceneVideos.map((video, index) => {
                    const videoUrl = `/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(video.path)}`;
                    return (
                      <button
                        key={video.path}
                        type="button"
                        onClick={() => setExpandedVideoIndex(index)}
                        className={`relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900 transition ${index === expandedVideoIndex ? "border-violet-400" : "border-white/20 opacity-70 hover:opacity-100"}`}
                        aria-label={`${video.order ?? video.label} 영상 보기`}
                        aria-pressed={index === expandedVideoIndex}
                      >
                        <video
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        >
                          <source src={`${videoUrl}#t=0.1`} />
                        </video>
                        <span className="absolute bottom-0 left-0 right-0 bg-slate-950/75 py-0.5 text-[10px] font-bold text-white">
                          {video.order ?? "현재"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }
  if (file.kind === "audio") {
    return (
      <div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-800 p-6 text-white">
        <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
          <Icon name="music" className="h-6 w-6" />
        </span>
        <audio
          key={contentUrl}
          controls
          preload="metadata"
          className="w-full"
          onError={() =>
            setMediaError(
              "오디오 파일이 손상되었거나 브라우저가 코덱을 지원하지 않습니다.",
            )
          }
        >
          <source src={contentUrl} />
          브라우저에서 오디오 재생을 지원하지 않습니다.
        </audio>
      </div>
    );
  }
  if (file.kind === "unsupported") return <FileProblem file={file} />;
  if (textError) return <FileProblem file={file} message={textError} />;
  if (textContent === null) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-2xl bg-slate-50 text-sm font-semibold text-slate-500">
        파일을 읽는 중입니다.
      </div>
    );
  }
  if (file.kind === "text") {
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word rounded-2xl bg-slate-950 p-5 text-xs leading-6 text-slate-200">
        {textContent}
      </pre>
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textContent) as unknown;
  } catch {
    return (
      <FileProblem
        file={file}
        message="JSON 문법이 올바르지 않아 내용을 해석할 수 없습니다."
      />
    );
  }
  const formattedJson = JSON.stringify(parsedJson, null, 2);
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setJsonCopyStatus("copied");
    } catch {
      setJsonCopyStatus("error");
    }
  };
  return (
    <div>
      <div
        className="mb-3 flex rounded-xl bg-slate-100 p-1"
        role="group"
        aria-label="JSON 보기 방식"
      >
        {(["readable", "raw"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setJsonView(mode)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${jsonView === mode ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
            aria-pressed={jsonView === mode}
          >
            {mode === "readable" ? "읽기 쉬운 보기" : "원본 보기"}
          </button>
        ))}
      </div>
      {jsonView === "readable" ? (
        <JsonReadablePreview
          project={project}
          value={parsedJson}
          isProjectDocument={file.relativePath === "project.json"}
        />
      ) : (
        <div className="group relative">
          <button
            type="button"
            onClick={copyJson}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-slate-800/90 text-slate-200 opacity-0 shadow-sm backdrop-blur transition hover:bg-slate-700 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            aria-label={
              jsonCopyStatus === "copied"
                ? "JSON 복사 완료"
                : "JSON 파일 복사하기"
            }
            title="JSON 파일 복사하기"
          >
            <Icon
              name={jsonCopyStatus === "copied" ? "check" : "copy"}
              className="h-4 w-4"
            />
          </button>
          <pre className="max-h-96 overflow-auto whitespace-pre rounded-2xl bg-slate-950 p-4 text-[10px] leading-4 text-violet-100">
            {formattedJson}
          </pre>
          <span className="sr-only" aria-live="polite">
            {jsonCopyStatus === "copied"
              ? "JSON을 클립보드에 복사했습니다."
              : jsonCopyStatus === "error"
                ? "JSON을 복사하지 못했습니다."
                : ""}
          </span>
        </div>
      )}
    </div>
  );
}

