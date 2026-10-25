"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  createSubtitleTrack,
  imageMotionPreset,
  moveNarrationSegment,
  resizeSceneClip,
  timelineDuration,
  updateImageMotion,
  updateSceneTransition,
  validateEditingTimeline,
} from "@/lib/editing-timeline";
import { summarizeAudioSamples, type WaveformBar } from "@/lib/audio-waveform";
import type { EditingTimeline, ProjectDocument } from "@/lib/project-schema";
import { projectFileUrl } from "@/lib/project-file-url";
import type { DashboardFile } from "./shorts-dashboard-shared";
import { Icon } from "./shorts-dashboard-shared";

export type TimelineSelection =
  | { type: "scene"; id: string }
  | { type: "transition"; id: string }
  | { type: "narration"; id: string }
  | { type: "subtitle"; id: string }
  | { type: "music"; id: string };

const DEFAULT_PIXELS_PER_SECOND = 48;
const MIN_PIXELS_PER_SECOND = 8;
const MAX_PIXELS_PER_SECOND = 96;
const ZOOM_STEP = 8;
const LABEL_WIDTH = 112;

function timeLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function contentUrl(projectId: string, relativePath: string) {
  return projectFileUrl(projectId, relativePath);
}

function motionLabel(
  type: NonNullable<
    EditingTimeline["sceneClips"][number]["imageMotion"]
  >["type"],
) {
  return type === "zoom-in" ? "확대" : type === "zoom-out" ? "축소" : "이동";
}

function narrationSourceRanges(
  narration: NonNullable<EditingTimeline["narration"]>,
) {
  let sourceStartSeconds = narration.startSeconds;
  return new Map(
    narration.segments.map((segment) => {
      const durationSeconds = segment.endSeconds - segment.startSeconds;
      const source = { startSeconds: sourceStartSeconds, durationSeconds };
      sourceStartSeconds += durationSeconds;
      return [segment.sceneId, source];
    }),
  );
}

export function TimelineEditor({
  project,
  files,
  playheadSeconds,
  selection,
  onSelectionChange,
  onPlayheadChange,
  onProjectChange,
}: {
  project: ProjectDocument;
  files: readonly DashboardFile[];
  playheadSeconds: number;
  selection: TimelineSelection | null;
  onSelectionChange: (selection: TimelineSelection) => void;
  onPlayheadChange: (seconds: number) => void;
  onProjectChange: (project: ProjectDocument) => void;
}) {
  const timeline = project.editing.timeline;
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(
    DEFAULT_PIXELS_PER_SECOND,
  );
  const [drag, setDrag] = useState<{
    type: "scene" | "narration";
    id: string;
    originX: number;
    originValue: number;
  } | null>(null);
  const availableAssetIds = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.status === "available")
          .map((file) => file.id),
      ),
    [files],
  );
  if (!timeline) return null;
  const duration = timelineDuration(timeline);
  const trackWidth = Math.max(320, Math.ceil(duration * pixelsPerSecond) + 40);
  const errors = validateEditingTimeline(project, availableAssetIds);
  const ticks = Array.from(
    { length: Math.floor(duration) + 1 },
    (_, index) => index,
  );
  const narrationAsset = project.assets.find(
    (asset) => asset.id === timeline.narration?.assetId,
  );
  const narrationSources = timeline.narration
    ? narrationSourceRanges(timeline.narration)
    : new Map<string, { startSeconds: number; durationSeconds: number }>();
  const musicAsset = project.assets.find(
    (asset) => asset.id === timeline.music?.assetId,
  );
  const majorTickInterval =
    pixelsPerSecond >= 40 ? 5 : pixelsPerSecond >= 20 ? 10 : 30;
  const zoomPercent = Math.round(
    (pixelsPerSecond / DEFAULT_PIXELS_PER_SECOND) * 100,
  );

  const updateZoom = (nextPixelsPerSecond: number) => {
    setPixelsPerSecond(
      Math.max(
        MIN_PIXELS_PER_SECOND,
        Math.min(MAX_PIXELS_PER_SECOND, nextPixelsPerSecond),
      ),
    );
  };

  const fitTimeline = () => {
    const viewportWidth = scrollViewportRef.current?.clientWidth ?? 0;
    if (viewportWidth === 0 || duration <= 0) return;
    const availableTrackWidth = viewportWidth - LABEL_WIDTH - 80;
    updateZoom(availableTrackWidth / duration);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const deltaSeconds = (event.clientX - drag.originX) / pixelsPerSecond;
    if (drag.type === "scene")
      onProjectChange(
        resizeSceneClip(project, drag.id, drag.originValue + deltaSeconds),
      );
    else
      onProjectChange(
        moveNarrationSegment(project, drag.id, drag.originValue + deltaSeconds),
      );
  };
  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    type: "scene" | "narration",
    id: string,
    value: number,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ type, id, originX: event.clientX, originValue: value });
  };

  return (
    <section
      aria-labelledby="timeline-heading"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">
            Timeline
          </p>
          <h2
            id="timeline-heading"
            className="mt-1 text-lg font-extrabold text-slate-950"
          >
            최종 편집 타임라인
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
          <div
            className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white"
            aria-label="타임라인 확대 및 축소"
          >
            <button
              type="button"
              aria-label="타임라인 축소"
              disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
              className="h-8 w-8 text-base text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              onClick={() => updateZoom(pixelsPerSecond - ZOOM_STEP)}
            >
              −
            </button>
            <span
              className="min-w-12 border-x border-slate-200 px-2 text-center text-[11px] text-slate-600"
              aria-live="polite"
            >
              {zoomPercent}%
            </span>
            <button
              type="button"
              aria-label="타임라인 확대"
              disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
              className="h-8 w-8 text-base text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              onClick={() => updateZoom(pixelsPerSecond + ZOOM_STEP)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] text-slate-600 transition hover:bg-slate-50"
            onClick={fitTimeline}
          >
            전체 보기
          </button>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
            {timeLabel(playheadSeconds)} / {timeLabel(duration)}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 ${errors.length ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
          >
            {errors.length ? `확인 필요 ${errors.length}` : "배치 유효"}
          </span>
        </div>
      </div>
      {errors.length > 0 && (
        <div
          role="alert"
          className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-700"
        >
          {errors.join(" ")}
        </div>
      )}
      <div ref={scrollViewportRef} className="overflow-x-auto p-5 pt-4">
        <div
          className="relative"
          style={{ width: LABEL_WIDTH + trackWidth }}
          onPointerMove={move}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <div
            className="relative ml-28 h-8 border-b border-slate-200"
            style={{ width: trackWidth }}
            onPointerDown={(event) =>
              onPlayheadChange(
                Math.max(
                  0,
                  Math.min(
                    duration,
                    event.nativeEvent.offsetX / pixelsPerSecond,
                  ),
                ),
              )
            }
          >
            {ticks.map((tick) => {
              const major = tick % majorTickInterval === 0;
              return (
                <div
                  key={tick}
                  className={`absolute bottom-0 border-l text-[10px] font-semibold text-slate-400 ${major ? "h-3 border-slate-300" : "h-1.5 border-slate-300/80"}`}
                  style={{ left: tick * pixelsPerSecond }}
                >
                  {major && (
                    <span className="absolute -top-4 left-1">
                      {timeLabel(tick)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-violet-600"
            style={{ left: LABEL_WIDTH + playheadSeconds * pixelsPerSecond }}
          >
            <span className="absolute -left-1.5 top-5 h-3 w-3 rotate-45 rounded-xs bg-violet-600" />
          </div>

          <TrackRow
            label="이미지·영상"
            icon="video"
            width={trackWidth}
            pixelsPerSecond={pixelsPerSecond}
          >
            {timeline.sceneClips.map((clip) => {
              const scene = project.scenes.find(
                (candidate) => candidate.id === clip.sceneId,
              );
              const asset = project.assets.find(
                (candidate) => candidate.id === clip.assetId,
              );
              return (
                <div
                  key={clip.sceneId}
                  role="button"
                  tabIndex={0}
                  aria-label={`${scene?.order ?? ""}번 장면 설정`}
                  className={`absolute top-1 h-16 overflow-hidden rounded-xl border bg-violet-100 shadow-sm ${selection?.type === "scene" && selection.id === clip.sceneId ? "z-10 border-violet-700 ring-2 ring-violet-400" : "border-violet-300"}`}
                  style={{
                    left: clip.startSeconds * pixelsPerSecond,
                    width: Math.max(44, clip.durationSeconds * pixelsPerSecond),
                  }}
                  onClick={() =>
                    onSelectionChange({ type: "scene", id: clip.sceneId })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      onSelectionChange({ type: "scene", id: clip.sceneId });
                  }}
                >
                  <div className="flex h-full items-center gap-2 overflow-hidden pr-3">
                    {asset?.kind === "image" ? (
                      <span className="relative h-full w-12 shrink-0 overflow-hidden bg-slate-200">
                        <Image
                          src={contentUrl(
                            project.project.id,
                            asset.relativePath,
                          )}
                          alt=""
                          fill
                          unoptimized
                          sizes="48px"
                          className="object-cover"
                        />
                      </span>
                    ) : (
                      <span className="flex h-full w-10 shrink-0 items-center justify-center bg-violet-200 text-violet-700">
                        <Icon name="video" className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <strong className="block truncate text-xs text-violet-950">
                        장면 {scene?.order ?? "?"}
                      </strong>
                      <span className="mt-1 block text-[10px] font-bold text-violet-700">
                        {clip.durationSeconds.toFixed(1)}초 ·{" "}
                        {clip.mediaType === "video"
                          ? "영상"
                          : clip.imageMotion
                            ? `이미지 · ${motionLabel(clip.imageMotion.type)}`
                            : "이미지"}
                      </span>
                    </span>
                  </div>
                  <div
                    role="separator"
                    aria-label={`${scene?.order ?? ""}번 장면 길이 조절`}
                    className="absolute bottom-0 right-0 top-0 w-3 cursor-ew-resize bg-violet-500/25 hover:bg-violet-500/45"
                    onPointerDown={(event) =>
                      beginDrag(
                        event,
                        "scene",
                        clip.sceneId,
                        clip.durationSeconds,
                      )
                    }
                  />
                </div>
              );
            })}
            {timeline.transitions.map((transition) => {
              const nextClip = timeline.sceneClips.find(
                (clip) => clip.sceneId === transition.toSceneId,
              );
              if (!nextClip) return null;
              const active = transition.type !== "none";
              return (
                <button
                  key={transition.id}
                  type="button"
                  aria-label={`${transition.fromSceneId}에서 ${transition.toSceneId} 전환 설정`}
                  onClick={() =>
                    onSelectionChange({ type: "transition", id: transition.id })
                  }
                  title={
                    active
                      ? `${transition.type === "dissolve" ? "디졸브" : "페이드"} ${transition.durationSeconds.toFixed(1)}초`
                      : "전환 추가"
                  }
                  className={`absolute top-1 z-20 flex h-4 items-center justify-center border text-[8px] leading-none font-bold shadow-sm ${active ? "rounded-md border-amber-400 bg-amber-300/80 text-amber-950" : "-translate-x-1/2 rounded-full border-slate-300 bg-white text-slate-500"} ${selection?.type === "transition" && selection.id === transition.id ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                  style={{
                    left:
                      (nextClip.startSeconds -
                        (active ? transition.durationSeconds : 0)) *
                      pixelsPerSecond,
                    width: active
                      ? Math.max(
                          16,
                          transition.durationSeconds * pixelsPerSecond,
                        )
                      : 16,
                  }}
                >
                  {active ? (transition.type === "dissolve" ? "D" : "F") : "+"}
                </button>
              );
            })}
          </TrackRow>

          <TrackRow
            label="내레이션"
            subtitle={`음량 ${Math.round((timeline.narration?.volume ?? 1) * 100)}%`}
            icon="audio"
            width={trackWidth}
            pixelsPerSecond={pixelsPerSecond}
          >
            {timeline.narration?.segments.map((segment) => {
              const scene = project.scenes.find(
                (candidate) => candidate.id === segment.sceneId,
              );
              const source = narrationSources.get(segment.sceneId);
              return (
                <div
                  key={segment.sceneId}
                  role="button"
                  tabIndex={0}
                  aria-label={`장면 ${scene?.order ?? ""} 내레이션 설정`}
                  className={`absolute top-2 z-10 h-14 touch-none cursor-grab select-none overflow-hidden rounded-lg border bg-sky-100/35 active:cursor-grabbing ${selection?.type === "narration" && selection.id === segment.sceneId ? "border-sky-700 ring-2 ring-sky-300" : "border-sky-400/45"}`}
                  style={{
                    left: segment.startSeconds * pixelsPerSecond,
                    width: Math.max(
                      36,
                      (segment.endSeconds - segment.startSeconds) *
                        pixelsPerSecond,
                    ),
                  }}
                  onPointerDown={(event) =>
                    beginDrag(
                      event,
                      "narration",
                      segment.sceneId,
                      segment.startSeconds,
                    )
                  }
                  onClick={() =>
                    onSelectionChange({
                      type: "narration",
                      id: segment.sceneId,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      onSelectionChange({
                        type: "narration",
                        id: segment.sceneId,
                      });
                  }}
                >
                  {narrationAsset && source && (
                    <AudioWaveform
                      key={`${narrationAsset.id}-${segment.sceneId}-${source.durationSeconds}`}
                      url={contentUrl(
                        project.project.id,
                        narrationAsset.relativePath,
                      )}
                      startSeconds={source.startSeconds}
                      durationSeconds={source.durationSeconds}
                      left={0}
                      width="100%"
                      tone="voice"
                    />
                  )}
                  <span className="absolute bottom-1.5 left-2 right-2 z-10 truncate rounded bg-white/75 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                    장면 {scene?.order ?? "?"} · {scene?.narration}
                  </span>
                </div>
              );
            })}
            {!timeline.narration && (
              <EmptyTrack text="선택한 전체 더빙이 없습니다" />
            )}
          </TrackRow>

          <TrackRow
            label="배경음악"
            subtitle={
              timeline.music
                ? `음량 ${Math.round(timeline.music.volume * 100)}% · 페이드 ${timeline.music.fadeInSeconds}/${timeline.music.fadeOutSeconds}s`
                : "음량 파형"
            }
            icon="music"
            width={trackWidth}
            pixelsPerSecond={pixelsPerSecond}
          >
            {timeline.music ? (
              <div
                role="button"
                tabIndex={0}
                className={`absolute top-2 flex h-14 items-end overflow-hidden rounded-lg border bg-fuchsia-100/50 px-3 pb-1.5 ${selection?.type === "music" ? "border-fuchsia-700 ring-2 ring-fuchsia-300" : "border-fuchsia-300/65"}`}
                style={{
                  left: timeline.music.startSeconds * pixelsPerSecond,
                  width: Math.max(
                    44,
                    (timeline.music.endSeconds - timeline.music.startSeconds) *
                      pixelsPerSecond,
                  ),
                }}
                onClick={() =>
                  onSelectionChange({
                    type: "music",
                    id: timeline.music!.assetId,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onSelectionChange({
                      type: "music",
                      id: timeline.music!.assetId,
                    });
                }}
              >
                {musicAsset && (
                  <AudioWaveform
                    key={`${musicAsset.id}-${timeline.music.endSeconds - timeline.music.startSeconds}`}
                    url={contentUrl(
                      project.project.id,
                      musicAsset.relativePath,
                    )}
                    startSeconds={0}
                    durationSeconds={
                      timeline.music.endSeconds - timeline.music.startSeconds
                    }
                    left={0}
                    width="100%"
                    tone="music"
                  />
                )}
                <span className="relative z-10 truncate rounded bg-white/75 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-800">
                  선택한 배경음악 ·{" "}
                  {(
                    timeline.music.endSeconds - timeline.music.startSeconds
                  ).toFixed(1)}
                  초
                </span>
              </div>
            ) : (
              <EmptyTrack text="선택한 배경음악이 없습니다" />
            )}
          </TrackRow>

          <TrackRow
            label="자막"
            subtitle={
              timeline.subtitles.enabled
                ? `${timeline.subtitles.cues.length}개 · 표시`
                : "숨김"
            }
            icon="document"
            width={trackWidth}
            pixelsPerSecond={pixelsPerSecond}
          >
            {timeline.subtitles.cues.map((cue) => (
              <button
                key={cue.id}
                type="button"
                className={`absolute top-3 h-12 overflow-hidden rounded-md border px-1.5 text-left ${selection?.type === "subtitle" && selection.id === cue.id ? "border-emerald-700 bg-emerald-100 ring-2 ring-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
                style={{
                  left: cue.startSeconds * pixelsPerSecond,
                  width: Math.max(
                    36,
                    (cue.endSeconds - cue.startSeconds) * pixelsPerSecond,
                  ),
                }}
                onClick={() =>
                  onSelectionChange({ type: "subtitle", id: cue.id })
                }
              >
                <span
                  className="line-clamp-2 text-[10px] leading-3 font-semibold"
                  style={{ wordBreak: "keep-all", overflowWrap: "normal" }}
                >
                  {cue.text || "빈 자막"}
                </span>
              </button>
            ))}
            {timeline.subtitles.cues.length === 0 && (
              <EmptyTrack text="생성된 자막이 없습니다" />
            )}
          </TrackRow>
        </div>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">
        확대·축소 또는 전체 보기로 시간축을 조절할 수 있습니다. 장면 오른쪽
        핸들을 드래그해 길이를 조절하고, 내레이션 클립을 드래그해 구간을
        이동하세요. 변경은 원본 미디어가 아닌 project.json 편집 정보에만
        반영됩니다.
      </p>
    </section>
  );
}

function TrackRow({
  label,
  subtitle,
  icon,
  width,
  pixelsPerSecond,
  children,
}: {
  label: string;
  subtitle?: string;
  icon: "video" | "audio" | "music" | "document";
  width: number;
  pixelsPerSecond: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-2 h-20">
      <div className="absolute inset-y-0 left-0 flex w-28 items-center gap-2 rounded-l-xl border border-slate-200 bg-slate-50 px-3 text-xs font-extrabold text-slate-700">
        <Icon name={icon} className="h-4 w-4 text-violet-600" />
        <span>
          <span className="block">{label}</span>
          {subtitle && (
            <span className="mt-1 block text-[9px] font-semibold leading-3 text-slate-400">
              {subtitle}
            </span>
          )}
        </span>
      </div>
      <div
        className="absolute inset-y-0 left-28 overflow-hidden rounded-r-xl border-y border-r border-slate-200 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px)]"
        style={{ width, backgroundSize: `${pixelsPerSecond}px 100%` }}
      >
        {children}
      </div>
    </div>
  );
}

function AudioWaveform({
  url,
  startSeconds,
  durationSeconds,
  left,
  width,
  tone,
}: {
  url: string;
  startSeconds: number;
  durationSeconds: number;
  left: number;
  width: number | string;
  tone: "voice" | "music";
}) {
  const [bars, setBars] = useState<WaveformBar[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let audioContext: AudioContext | null = null;
    const closeAudioContext = () => {
      if (audioContext?.state !== "closed")
        void audioContext?.close().catch(() => undefined);
    };
    fetch(url, { signal: controller.signal, cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("오디오 파일을 읽을 수 없습니다.");
        return response.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (controller.signal.aborted) return;
        setBars(
          summarizeAudioSamples(
            audioBuffer.getChannelData(0),
            audioBuffer.sampleRate,
            startSeconds,
            Math.min(durationSeconds, audioBuffer.duration - startSeconds),
            180,
          ),
        );
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setFailed(true);
      })
      .finally(() => {
        closeAudioContext();
      });
    return () => {
      controller.abort();
      closeAudioContext();
    };
  }, [durationSeconds, startSeconds, url]);

  return (
    <div
      aria-label={
        tone === "voice"
          ? "더빙 파형: 진한 부분은 발화, 옅은 부분은 무음"
          : "배경음악 파형"
      }
      className={`pointer-events-none absolute z-0 overflow-hidden ${tone === "voice" ? "bottom-5 top-1.5" : "bottom-4 top-2"}`}
      style={{ left, width }}
    >
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-slate-400">
          파형을 불러올 수 없음
        </span>
      ) : bars.length === 0 ? (
        <span
          className={`absolute left-0 right-0 top-1/2 h-px animate-pulse ${tone === "voice" ? "bg-sky-300" : "bg-fuchsia-300"}`}
        />
      ) : (
        <svg
          viewBox={`0 0 ${bars.length * 2} 48`}
          preserveAspectRatio="none"
          className="h-full w-full"
          aria-hidden="true"
        >
          {bars.map((bar, index) => {
            const height =
              tone === "voice" && !bar.active
                ? 1.5
                : Math.max(2.5, bar.amplitude * 26);
            return (
              <rect
                key={index}
                x={index * 2}
                y={(48 - height) / 2}
                width={1.2}
                height={height}
                rx={0.6}
                className={
                  tone === "music"
                    ? "fill-fuchsia-500/50"
                    : bar.active
                      ? "fill-sky-600/55"
                      : "fill-sky-400/38"
                }
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

function EmptyTrack({ text }: { text: string }) {
  return (
    <span className="absolute left-4 top-7 text-[11px] font-semibold text-slate-400">
      {text}
    </span>
  );
}

function PreviewMedia({
  projectId,
  asset,
  clip,
  playheadSeconds,
  playing,
  opacity,
  sizes,
}: {
  projectId: string;
  asset: ProjectDocument["assets"][number];
  clip: EditingTimeline["sceneClips"][number];
  playheadSeconds: number;
  playing: boolean;
  opacity: number;
  sizes: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const localSeconds = Math.max(0, playheadSeconds - clip.startSeconds);
  const localSecondsRef = useRef(localSeconds);
  const motion = clip.imageMotion;
  const motionProgress = motion
    ? Math.max(
        0,
        Math.min(
          1,
          (localSeconds - motion.startSeconds) / motion.durationSeconds,
        ),
      )
    : 0;
  const easedMotionProgress =
    motionProgress * motionProgress * (3 - 2 * motionProgress);
  const interpolate = (start: number, end: number) =>
    start + (end - start) * easedMotionProgress;
  const imageStyle = (() => {
    if (!motion) return undefined;
    const scale = interpolate(motion.start.scale, motion.end.scale);
    const xPercent = interpolate(motion.start.xPercent, motion.end.xPercent);
    const yPercent = interpolate(motion.start.yPercent, motion.end.yPercent);
    const maximumOffsetPercent = ((scale - 1) / (2 * scale)) * 100;
    const translateX = ((50 - xPercent) / 50) * maximumOffsetPercent;
    const translateY = ((50 - yPercent) / 50) * maximumOffsetPercent;
    return {
      objectPosition: "50% 50%",
      transform: `scale(${scale}) translate3d(${translateX}%, ${translateY}%, 0)`,
      transformOrigin: "center",
    };
  })();

  useEffect(() => {
    localSecondsRef.current = localSeconds;
  }, [localSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const expectedTime = clip.trimStartSeconds + localSecondsRef.current;
    const synchronize = () => {
      if (Math.abs(video.currentTime - expectedTime) > 0.08)
        video.currentTime = expectedTime;
      if (playing) void video.play().catch(() => undefined);
      else video.pause();
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) synchronize();
    else video.addEventListener("loadedmetadata", synchronize, { once: true });
    return () => video.removeEventListener("loadedmetadata", synchronize);
  }, [clip.trimStartSeconds, playing]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const expectedTime = clip.trimStartSeconds + localSeconds;
    if (!playing || Math.abs(video.currentTime - expectedTime) > 0.35)
      video.currentTime = expectedTime;
  }, [clip.trimStartSeconds, localSeconds, playing]);

  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      style={{ opacity }}
    >
      {asset.kind === "image" ? (
        <Image
          src={contentUrl(projectId, asset.relativePath)}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          className="object-cover will-change-transform"
          style={imageStyle}
        />
      ) : (
        <video
          ref={videoRef}
          src={contentUrl(projectId, asset.relativePath)}
          muted
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function EditingInspector({
  project,
  selection,
  onProjectChange,
}: {
  project: ProjectDocument;
  selection: TimelineSelection | null;
  onProjectChange: (project: ProjectDocument) => void;
}) {
  const timeline = project.editing.timeline;
  if (!timeline || !selection)
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs leading-5 text-slate-500">
        타임라인에서 장면, 전환 구간 또는 오디오를 선택하면 상세 옵션이
        표시됩니다.
      </p>
    );

  const markChanged = (next: ProjectDocument, reason: string) => {
    if (next.output.assetId) {
      next.output.status = "확인 필요";
      next.output.stale = { isStale: true, reason };
    }
    onProjectChange(next);
  };

  if (selection.type === "transition") {
    const transition = timeline.transitions.find(
      (candidate) => candidate.id === selection.id,
    );
    if (!transition) return null;
    const from = project.scenes.find(
      (scene) => scene.id === transition.fromSceneId,
    );
    const to = project.scenes.find(
      (scene) => scene.id === transition.toSceneId,
    );
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <div>
          <p className="text-xs font-extrabold text-slate-800">장면 전환</p>
          <p className="mt-1 text-[10px] font-semibold text-slate-500">
            장면 {from?.order ?? "?"} → {to?.order ?? "?"}
          </p>
        </div>
        <label className="block text-[11px] font-bold text-slate-600">
          전환 종류
          <select
            value={transition.type}
            onChange={(event) =>
              onProjectChange(
                updateSceneTransition(
                  project,
                  transition.id,
                  event.target.value as "none" | "dissolve" | "fade",
                  transition.durationSeconds || 0.6,
                ),
              )
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="none">없음</option>
            <option value="dissolve">디졸브</option>
            <option value="fade">페이드</option>
          </select>
        </label>
        <label className="block text-[11px] font-bold text-slate-600">
          적용 시간 · {transition.durationSeconds.toFixed(1)}초
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.1}
            disabled={transition.type === "none"}
            value={Math.max(0.1, transition.durationSeconds)}
            onChange={(event) =>
              onProjectChange(
                updateSceneTransition(
                  project,
                  transition.id,
                  transition.type,
                  Number(event.target.value),
                ),
              )
            }
            className="mt-1 w-full accent-amber-500 disabled:opacity-40"
          />
        </label>
        <p className="text-[10px] leading-4 text-slate-500">
          전환은 영상 장면만 겹치며 저장된 내레이션 위치는 유지됩니다.
        </p>
      </div>
    );
  }

  if (selection.type === "scene") {
    const clip = timeline.sceneClips.find(
      (candidate) => candidate.sceneId === selection.id,
    );
    const scene = project.scenes.find(
      (candidate) => candidate.id === selection.id,
    );
    if (!clip) return null;
    if (clip.mediaType !== "image")
      return (
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          장면 {scene?.order ?? "?"}은 영상 장면입니다. 정지 이미지 모션은
          이미지 장면에만 적용됩니다.
        </p>
      );
    const motion = clip.imageMotion;
    const updateMotion = (nextMotion: NonNullable<typeof motion>) =>
      onProjectChange(updateImageMotion(project, clip.sceneId, nextMotion));
    const pointInput = (label: string, key: "start" | "end") =>
      motion && (
        <fieldset className="rounded-lg border border-slate-200 bg-white p-2">
          <legend className="px-1 text-[10px] font-extrabold text-slate-500">
            {label}
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(["xPercent", "yPercent", "scale"] as const).map((field) => (
              <label
                key={field}
                className="text-[9px] font-bold text-slate-500"
              >
                {field === "xPercent"
                  ? "가로 %"
                  : field === "yPercent"
                    ? "세로 %"
                    : "배율"}
                <input
                  type="number"
                  min={field === "scale" ? 1 : 0}
                  max={field === "scale" ? 3 : 100}
                  step={field === "scale" ? 0.05 : 1}
                  value={motion[key][field]}
                  onChange={(event) =>
                    updateMotion({
                      ...motion,
                      [key]: {
                        ...motion[key],
                        [field]: Number(event.target.value),
                      },
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-slate-200 px-1.5 text-xs"
                />
              </label>
            ))}
          </div>
        </fieldset>
      );
    return (
      <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
        <div>
          <p className="text-xs font-extrabold text-slate-800">
            장면 {scene?.order ?? "?"} 이미지 효과
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            범용 키프레임 없이 시작·종료 상태만 설정합니다.
          </p>
        </div>
        <label className="block text-[11px] font-bold text-slate-600">
          효과
          <select
            value={motion?.type ?? "none"}
            onChange={(event) =>
              onProjectChange(
                updateImageMotion(
                  project,
                  clip.sceneId,
                  event.target.value === "none"
                    ? null
                    : imageMotionPreset(
                        event.target.value as "zoom-in" | "zoom-out" | "pan",
                        clip.durationSeconds,
                      ),
                ),
              )
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
          >
            <option value="none">없음</option>
            <option value="zoom-in">확대</option>
            <option value="zoom-out">축소</option>
            <option value="pan">이동</option>
          </select>
        </label>
        {motion && (
          <>
            {pointInput("시작 위치·배율", "start")}
            {pointInput("종료 위치·배율", "end")}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold text-slate-500">
                시작 시간
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, clip.durationSeconds - 0.1)}
                  step={0.1}
                  value={motion.startSeconds}
                  onChange={(event) => {
                    const startSeconds = Number(event.target.value);
                    updateMotion({
                      ...motion,
                      startSeconds,
                      durationSeconds: Math.min(
                        motion.durationSeconds,
                        clip.durationSeconds - startSeconds,
                      ),
                    });
                  }}
                  className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
                />
              </label>
              <label className="text-[10px] font-bold text-slate-500">
                적용 시간
                <input
                  type="number"
                  min={0.1}
                  max={clip.durationSeconds - motion.startSeconds}
                  step={0.1}
                  value={motion.durationSeconds}
                  onChange={(event) =>
                    updateMotion({
                      ...motion,
                      durationSeconds: Number(event.target.value),
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
                />
              </label>
            </div>
          </>
        )}
      </div>
    );
  }

  if (selection.type === "narration" && timeline.narration) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
        <p className="text-xs font-extrabold text-slate-800">전체 내레이션</p>
        <label className="mt-3 block text-[11px] font-bold text-slate-600">
          음량 · {Math.round(timeline.narration.volume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={timeline.narration.volume}
            onChange={(event) => {
              const next = structuredClone(project);
              if (next.editing.timeline?.narration)
                next.editing.timeline.narration.volume = Number(
                  event.target.value,
                );
              markChanged(next, "내레이션 음량 변경");
            }}
            className="mt-1 w-full accent-sky-600"
          />
        </label>
      </div>
    );
  }

  if (selection.type === "subtitle") {
    const cue = timeline.subtitles.cues.find(
      (candidate) => candidate.id === selection.id,
    );
    if (!cue) return null;
    const updateCue = (change: Partial<typeof cue>) => {
      const next = structuredClone(project);
      const target = next.editing.timeline?.subtitles.cues.find(
        (candidate) => candidate.id === cue.id,
      );
      if (target) Object.assign(target, change);
      markChanged(next, "자막 내용 또는 시간 변경");
    };
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <p className="text-xs font-extrabold text-slate-800">자막 구간</p>
        <label className="block text-[11px] font-bold text-slate-600">
          텍스트
          <textarea
            value={cue.text}
            maxLength={500}
            onChange={(event) => updateCue({ text: event.target.value })}
            className="mt-1 min-h-20 w-full resize-y rounded-lg border border-emerald-200 bg-white p-2 text-xs font-normal leading-5"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold text-slate-500">
            시작
            <input
              type="number"
              min={0}
              step={0.01}
              value={cue.startSeconds}
              onChange={(event) =>
                updateCue({ startSeconds: Number(event.target.value) })
              }
              className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            종료
            <input
              type="number"
              min={cue.startSeconds + 0.01}
              step={0.01}
              value={cue.endSeconds}
              onChange={(event) =>
                updateCue({ endSeconds: Number(event.target.value) })
              }
              className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
            />
          </label>
        </div>
      </div>
    );
  }

  if (selection.type === "music" && timeline.music) {
    const musicDuration =
      timeline.music.endSeconds - timeline.music.startSeconds;
    const updateMusic = (change: Partial<typeof timeline.music>) => {
      const next = structuredClone(project);
      if (next.editing.timeline?.music)
        Object.assign(next.editing.timeline.music, change);
      markChanged(next, "배경음악 설정 변경");
    };
    return (
      <div className="space-y-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-3">
        <p className="text-xs font-extrabold text-slate-800">배경음악</p>
        <label className="block text-[11px] font-bold text-slate-600">
          음량 · {Math.round(timeline.music.volume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={timeline.music.volume}
            onChange={(event) =>
              updateMusic({ volume: Number(event.target.value) })
            }
            className="mt-1 w-full accent-fuchsia-600"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold text-slate-500">
            페이드 인
            <input
              type="number"
              min={0}
              max={musicDuration}
              step={0.1}
              value={timeline.music.fadeInSeconds}
              onChange={(event) =>
                updateMusic({ fadeInSeconds: Number(event.target.value) })
              }
              className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-slate-500">
            페이드 아웃
            <input
              type="number"
              min={0}
              max={musicDuration}
              step={0.1}
              value={timeline.music.fadeOutSeconds}
              onChange={(event) =>
                updateMusic({ fadeOutSeconds: Number(event.target.value) })
              }
              className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
            />
          </label>
        </div>
      </div>
    );
  }
  return null;
}

export function EditingPreview({
  project,
  playheadSeconds,
  playing,
  selection,
  onPlayingChange,
  onPlayheadChange,
  onProjectChange,
  busy,
  onRender,
  onCancelRender,
  activeRenderRunId,
}: {
  project: ProjectDocument;
  playheadSeconds: number;
  playing: boolean;
  selection: TimelineSelection | null;
  onPlayingChange: (playing: boolean) => void;
  onPlayheadChange: (seconds: number) => void;
  onProjectChange: (project: ProjectDocument) => void;
  busy: boolean;
  onRender: () => void;
  onCancelRender: (runId: string) => void;
  activeRenderRunId: string | null;
}) {
  const timeline = project.editing.timeline;
  const duration = timeline ? timelineDuration(timeline) : 1;
  const narrationAudioRefs = useRef(new Map<string, HTMLAudioElement>());
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const playheadRef = useRef(playheadSeconds);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const activeSubtitle = timeline?.subtitles.enabled
    ? timeline.subtitles.cues.find(
        (cue) =>
          playheadSeconds >= cue.startSeconds &&
          playheadSeconds < cue.endSeconds,
      )
    : undefined;
  const activeTransition = timeline?.transitions.find((transition) => {
    if (transition.type === "none" || transition.durationSeconds <= 0)
      return false;
    const nextClip = timeline.sceneClips.find(
      (candidate) => candidate.sceneId === transition.toSceneId,
    );
    return Boolean(
      nextClip &&
      playheadSeconds >= nextClip.startSeconds - transition.durationSeconds &&
      playheadSeconds < nextClip.startSeconds,
    );
  });
  const transitionProgress = activeTransition
    ? (() => {
        const nextClip = timeline?.sceneClips.find(
          (candidate) => candidate.sceneId === activeTransition.toSceneId,
        );
        return nextClip
          ? Math.max(
              0,
              Math.min(
                1,
                (playheadSeconds -
                  (nextClip.startSeconds - activeTransition.durationSeconds)) /
                  activeTransition.durationSeconds,
              ),
            )
          : 0;
      })()
    : 0;
  const easedTransitionProgress =
    transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
  const activeClips =
    timeline?.sceneClips.filter(
      (candidate) =>
        playheadSeconds >= candidate.startSeconds &&
        playheadSeconds < candidate.startSeconds + candidate.durationSeconds,
    ) ?? [];
  const clip = activeClips.at(-1) ?? timeline?.sceneClips.at(-1);
  const asset = project.assets.find(
    (candidate) => candidate.id === clip?.assetId,
  );
  const scene = project.scenes.find(
    (candidate) => candidate.id === clip?.sceneId,
  );
  const transitionClips =
    activeTransition && timeline
      ? [
          timeline.sceneClips.find(
            (candidate) => candidate.sceneId === activeTransition.fromSceneId,
          ),
          timeline.sceneClips.find(
            (candidate) => candidate.sceneId === activeTransition.toSceneId,
          ),
        ].filter(
          (candidate): candidate is EditingTimeline["sceneClips"][number] =>
            candidate !== undefined,
        )
      : [];
  const narrationAsset = project.assets.find(
    (candidate) => candidate.id === timeline?.narration?.assetId,
  );
  const musicAsset = project.assets.find(
    (candidate) => candidate.id === timeline?.music?.assetId,
  );
  const narrationSources = useMemo(
    () =>
      timeline?.narration
        ? narrationSourceRanges(timeline.narration)
        : new Map<string, { startSeconds: number; durationSeconds: number }>(),
    [timeline],
  );

  useEffect(() => {
    playheadRef.current = playheadSeconds;
  }, [playheadSeconds]);

  useEffect(() => {
    if (!previewExpanded) return;
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
      if (event.key === "Escape") setPreviewExpanded(false);
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
  }, [previewExpanded]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const advance = (now: number) => {
      const next = playheadRef.current + (now - previous) / 1000;
      previous = now;
      if (next >= duration) {
        playheadRef.current = 0;
        onPlayheadChange(0);
        onPlayingChange(false);
        return;
      }
      playheadRef.current = next;
      onPlayheadChange(next);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [duration, onPlayheadChange, onPlayingChange, playing]);

  useEffect(() => {
    const synchronizeAudio = (
      audio: HTMLAudioElement | null,
      range: { startSeconds: number; endSeconds: number } | null | undefined,
      volume: number,
      sourceStartSeconds = 0,
    ) => {
      if (!audio || !range) return;
      audio.volume = volume;
      const active =
        playing &&
        playheadSeconds >= range.startSeconds &&
        playheadSeconds < range.endSeconds;
      const expectedTime =
        sourceStartSeconds +
        Math.max(
          0,
          Math.min(
            range.endSeconds - range.startSeconds,
            playheadSeconds - range.startSeconds,
          ),
        );

      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        if (!playing || Math.abs(audio.currentTime - expectedTime) > 0.35) {
          audio.currentTime = expectedTime;
        }
      }

      if (active) {
        if (audio.paused) void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    };

    for (const segment of timeline?.narration?.segments ?? []) {
      const source = narrationSources.get(segment.sceneId);
      synchronizeAudio(
        narrationAudioRefs.current.get(segment.sceneId) ?? null,
        segment,
        timeline?.narration?.volume ?? 1,
        source?.startSeconds,
      );
    }
    const music = timeline?.music;
    const fadeInGain =
      music && music.fadeInSeconds > 0
        ? Math.min(
            1,
            Math.max(
              0,
              (playheadSeconds - music.startSeconds) / music.fadeInSeconds,
            ),
          )
        : 1;
    const fadeOutGain =
      music && music.fadeOutSeconds > 0
        ? Math.min(
            1,
            Math.max(
              0,
              (music.endSeconds - playheadSeconds) / music.fadeOutSeconds,
            ),
          )
        : 1;
    synchronizeAudio(
      musicAudioRef.current,
      music,
      (music?.volume ?? 0.25) * Math.min(fadeInGain, fadeOutGain),
    );
  }, [narrationSources, playheadSeconds, playing, timeline]);

  const updateOutput = (
    change: Partial<ProjectDocument["output"]["settings"]>,
  ) => {
    const next = structuredClone(project);
    Object.assign(next.output.settings, change);
    if (next.output.assetId) {
      next.output.status = "확인 필요";
      next.output.stale = { isStale: true, reason: "출력 설정 변경" };
    }
    onProjectChange(next);
  };

  const updateSubtitles = (change: Partial<EditingTimeline["subtitles"]>) => {
    const next = structuredClone(project);
    if (next.editing.timeline)
      Object.assign(next.editing.timeline.subtitles, change);
    if (next.output.assetId) {
      next.output.status = "확인 필요";
      next.output.stale = { isStale: true, reason: "자막 설정 변경" };
    }
    onProjectChange(next);
  };

  const previewMedia = (sizes: string) => {
    const clips = activeTransition ? transitionClips : clip ? [clip] : [];
    return clips.map((candidate, index) => {
      const candidateAsset = project.assets.find(
        (item) => item.id === candidate.assetId,
      );
      if (!candidateAsset) return null;
      const opacity = !activeTransition
        ? 1
        : activeTransition.type === "dissolve"
          ? index === 0
            ? 1 - easedTransitionProgress
            : easedTransitionProgress
          : index === 0
            ? Math.max(0, 1 - easedTransitionProgress * 2)
            : Math.max(0, easedTransitionProgress * 2 - 1);
      return (
        <PreviewMedia
          key={`${sizes}-${candidate.sceneId}`}
          projectId={project.project.id}
          asset={candidateAsset}
          clip={candidate}
          playheadSeconds={playheadSeconds}
          playing={playing && playheadSeconds >= candidate.startSeconds}
          opacity={opacity}
          sizes={sizes}
        />
      );
    });
  };

  const subtitleOverlay = () => {
    if (!activeSubtitle || !timeline) return null;
    const style = timeline.subtitles.style;
    const output = project.output.settings;
    const subtitleMargin = Math.max(24, Math.round(output.height * 0.07));
    const horizontalInset = `${(subtitleMargin / output.width) * 100}%`;
    const verticalMargin = `${(subtitleMargin / output.height) * 100}%`;
    const vertical = style.position === "middle" ? "top-1/2 -translate-y-1/2" : "";
    const verticalStyle =
      style.position === "top"
        ? { top: verticalMargin }
        : style.position === "bottom"
          ? { bottom: verticalMargin }
          : undefined;
    const fontFamily =
      style.fontFamily === "serif"
        ? "serif"
        : style.fontFamily === "monospace"
          ? "monospace"
          : "sans-serif";
    return (
      <div
        className={`pointer-events-none absolute z-20 text-center font-bold leading-tight ${vertical}`}
        style={{
          insetInline: horizontalInset,
          ...verticalStyle,
        }}
      >
        <span
          className="whitespace-pre-wrap"
          style={{
            color: style.color,
            fontFamily,
            fontSize: `${(style.fontSize / output.width) * 100}cqw`,
            WebkitTextStroke: `${(style.outlineWidth / output.width) * 100}cqw ${style.outlineColor}`,
            paintOrder: "stroke fill",
            wordBreak: "keep-all",
            overflowWrap: "normal",
          }}
        >
          {activeSubtitle.text}
        </span>
      </div>
    );
  };

  const playbackControls = (modal = false) => (
    <div
      className={`flex items-center gap-3 ${modal ? "w-full max-w-2xl" : "mt-3"}`}
    >
      <button
        type="button"
        onClick={() => onPlayingChange(!playing)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition hover:bg-violet-500"
        aria-label={playing ? "미리보기 일시정지" : "미리보기 재생"}
        title={playing ? "일시정지" : "재생"}
      >
        <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
      </button>
      <input
        aria-label={modal ? "확대 미리보기 재생 위치" : "타임라인 재생 위치"}
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(playheadSeconds, duration)}
        onChange={(event) => onPlayheadChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-violet-600"
      />
      <span
        className={`text-[10px] font-bold ${modal ? "text-white" : "text-slate-300"}`}
      >
        {timeLabel(playheadSeconds)} / {timeLabel(duration)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-linear-to-br from-slate-950 to-slate-800 p-3">
        <div
          className="relative mx-auto overflow-hidden rounded-xl bg-black"
          style={{
            width: `min(100%, ${18 * (project.output.settings.width / project.output.settings.height)}rem)`,
            aspectRatio: `${project.output.settings.width} / ${project.output.settings.height}`,
            containerType: "inline-size",
          }}
        >
          {previewMedia("180px")}
          {subtitleOverlay()}
          {narrationAsset?.kind === "audio" &&
            timeline?.narration?.segments.map((segment) => (
              <audio
                key={`${narrationAsset.id}-${segment.sceneId}`}
                ref={(node) => {
                  if (node)
                    narrationAudioRefs.current.set(segment.sceneId, node);
                  else narrationAudioRefs.current.delete(segment.sceneId);
                }}
                src={contentUrl(
                  project.project.id,
                  narrationAsset.relativePath,
                )}
                preload="auto"
                aria-label={`장면 ${project.scenes.find((candidate) => candidate.id === segment.sceneId)?.order ?? ""} 더빙 미리듣기`}
              />
            ))}
          {timeline?.music && musicAsset?.kind === "audio" && (
            <audio
              key={musicAsset.id}
              ref={musicAudioRef}
              src={contentUrl(project.project.id, musicAsset.relativePath)}
              preload="auto"
              aria-label="타임라인 배경음악 미리듣기"
            />
          )}
          {!asset && (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs font-semibold text-slate-400">
              재생 위치에 표시할 미디어가 없습니다.
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
            장면 {scene?.order ?? "-"}
          </span>
          <button
            type="button"
            onClick={() => setPreviewExpanded(true)}
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950/70 text-white shadow-lg backdrop-blur transition hover:bg-slate-950/90"
            aria-label="타임라인 미리보기 크게 보기"
            title="크게 보기"
          >
            <Icon name="expand" className="h-4 w-4" />
          </button>
        </div>
        {playbackControls()}
      </div>
      {previewExpanded &&
        createPortal(
          <div
            className="fixed inset-0 z-100 flex items-center justify-center overscroll-none bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="타임라인 확대 미리보기"
            onClick={() => setPreviewExpanded(false)}
          >
            <button
              type="button"
              onClick={() => setPreviewExpanded(false)}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6 sm:top-6"
              aria-label="타임라인 확대 미리보기 닫기"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
            <div
              className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="relative min-h-0 flex-1 aspect-9/16 overflow-hidden rounded-2xl bg-black shadow-2xl"
                style={{
                  aspectRatio: `${project.output.settings.width} / ${project.output.settings.height}`,
                  containerType: "inline-size",
                }}
              >
                {previewMedia("50vw")}
                {subtitleOverlay()}
                {!asset && (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
                    재생 위치에 표시할 미디어가 없습니다.
                  </div>
                )}
                <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-xs font-bold text-white">
                  장면 {scene?.order ?? "-"}
                </span>
              </div>
              {playbackControls(true)}
            </div>
          </div>,
          document.body,
        )}
      <EditingInspector
        project={project}
        selection={selection}
        onProjectChange={onProjectChange}
      />
      {timeline && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-slate-800">자막 설정</p>
            <button
              type="button"
              onClick={() => {
                const generated = createSubtitleTrack(project, timeline);
                updateSubtitles({
                  alignment: generated.alignment,
                  cues: generated.cues,
                });
              }}
              className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[10px] font-bold text-emerald-700"
            >
              대본에서 다시 생성
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input
              type="checkbox"
              checked={timeline.subtitles.enabled}
              onChange={(event) =>
                updateSubtitles({ enabled: event.target.checked })
              }
              className="accent-emerald-600"
            />
            자막 표시
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[10px] font-bold text-slate-500">
              글꼴
              <select
                value={timeline.subtitles.style.fontFamily}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      fontFamily: event.target
                        .value as EditingTimeline["subtitles"]["style"]["fontFamily"],
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="sans-serif">고딕</option>
                <option value="serif">명조</option>
                <option value="monospace">고정폭</option>
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              위치
              <select
                value={timeline.subtitles.style.position}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      position: event.target
                        .value as EditingTimeline["subtitles"]["style"]["position"],
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="top">상단</option>
                <option value="middle">중앙</option>
                <option value="bottom">하단</option>
              </select>
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              크기
              <input
                type="number"
                min={12}
                max={160}
                value={timeline.subtitles.style.fontSize}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      fontSize: Number(event.target.value),
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              외곽선
              <input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={timeline.subtitles.style.outlineWidth}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      outlineWidth: Number(event.target.value),
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              글자색
              <input
                type="color"
                value={timeline.subtitles.style.color}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      color: event.target.value,
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-500">
              외곽선색
              <input
                type="color"
                value={timeline.subtitles.style.outlineColor}
                onChange={(event) =>
                  updateSubtitles({
                    style: {
                      ...timeline.subtitles.style,
                      outlineColor: event.target.value,
                    },
                  })
                }
                className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            {timeline.subtitles.alignment === "provider-timestamps"
              ? "공급자 타임스탬프 기준"
              : "내레이션 길이와 대사 분량으로 추정"}{" "}
            · 자막 {timeline.subtitles.cues.length}개
          </p>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-extrabold text-slate-800">출력 설정</p>
        <label className="mt-3 block text-[11px] font-bold text-slate-500">
          화면 비율
          <select
            value={project.output.settings.aspectRatio}
            onChange={(event) =>
              event.target.value === "9:16"
                ? updateOutput({
                    aspectRatio: "9:16",
                    width: 1080,
                    height: 1920,
                  })
                : updateOutput({
                    aspectRatio: "1:1",
                    width: 1080,
                    height: 1080,
                  })
            }
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800"
          >
            <option value="9:16">9:16 세로</option>
            <option value="1:1">1:1 정사각형</option>
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            너비
            <input
              type="number"
              min={360}
              max={4320}
              step={2}
              value={project.output.settings.width}
              onChange={(event) =>
                updateOutput({ width: Number(event.target.value) })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
            />
          </label>
          <label className="text-[11px] font-bold text-slate-500">
            높이
            <input
              type="number"
              min={360}
              max={4320}
              step={2}
              value={project.output.settings.height}
              onChange={(event) =>
                updateOutput({ height: Number(event.target.value) })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
            />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          {project.output.settings.width} × {project.output.settings.height}px
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            프레임 레이트
            <select
              value={project.output.settings.fps}
              onChange={(event) =>
                updateOutput({ fps: Number(event.target.value) })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>
          <label className="text-[11px] font-bold text-slate-500">
            영상 품질
            <select
              value={project.output.settings.quality}
              onChange={(event) =>
                updateOutput({
                  quality: event.target
                    .value as ProjectDocument["output"]["settings"]["quality"],
                })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="standard">표준</option>
              <option value="high">고품질</option>
            </select>
          </label>
        </div>
        {activeRenderRunId ? (
          <button
            type="button"
            onClick={() => onCancelRender(activeRenderRunId)}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-700"
          >
            렌더링 취소
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !timeline?.sceneClips.length}
            onClick={onRender}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="play" className="h-4 w-4" />
            {project.output.status === "실패" ||
            project.output.status === "취소됨"
              ? "최종 MP4 다시 렌더링"
              : "최종 MP4 렌더링"}
          </button>
        )}
        {project.editing.error && (
          <p role="alert" className="mt-2 text-[10px] leading-4 text-rose-600">
            {project.editing.error}
          </p>
        )}
      </div>
      {project.runs.some((run) => run.stageId === "editing") && (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-extrabold text-slate-800">렌더링 이력</p>
          <div className="mt-2 space-y-2">
            {project.runs
              .filter((run) => run.stageId === "editing")
              .slice(-3)
              .reverse()
              .map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg bg-slate-50 p-2 text-[10px] leading-4 text-slate-600"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-slate-800">{run.status}</strong>
                    <span>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString("ko-KR")
                        : ""}
                    </span>
                  </div>
                  <p className="mt-1">{run.errorSummary ?? run.message}</p>
                </div>
              ))}
          </div>
        </div>
      )}
      <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
        내레이션 정렬:{" "}
        {timeline?.narration?.alignment === "provider-timestamps"
          ? "공급자 타임스탬프 우선"
          : timeline?.narration
            ? "오디오 길이와 장면별 대사 분량으로 추정"
            : "더빙 없음"}
      </p>
    </div>
  );
}
