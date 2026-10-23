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
  moveNarrationSegment,
  resizeSceneClip,
  timelineDuration,
  validateEditingTimeline,
} from "@/lib/editing-timeline";
import { summarizeAudioSamples, type WaveformBar } from "@/lib/audio-waveform";
import type { EditingTimeline, ProjectDocument } from "@/lib/project-schema";
import type { DashboardFile } from "./shorts-dashboard-shared";
import { Icon } from "./shorts-dashboard-shared";

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
  return `/api/projects/${projectId}/files/content?path=${encodeURIComponent(relativePath)}`;
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
  onPlayheadChange,
  onProjectChange,
}: {
  project: ProjectDocument;
  files: readonly DashboardFile[];
  playheadSeconds: number;
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
                  className="absolute top-1 h-16 overflow-hidden rounded-xl border border-violet-300 bg-violet-100 shadow-sm"
                  style={{
                    left: clip.startSeconds * pixelsPerSecond,
                    width: Math.max(44, clip.durationSeconds * pixelsPerSecond),
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
                        {clip.mediaType === "video" ? "영상" : "이미지"}
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
          </TrackRow>

          <TrackRow
            label="내레이션"
            subtitle="진함 발화 · 옅음 무음"
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
                  className="absolute top-2 z-10 h-14 touch-none cursor-grab select-none overflow-hidden rounded-lg border border-sky-400/45 bg-sky-100/35 active:cursor-grabbing"
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
            subtitle="음량 파형"
            icon="music"
            width={trackWidth}
            pixelsPerSecond={pixelsPerSecond}
          >
            {timeline.music ? (
              <div
                className="absolute top-2 flex h-14 items-end overflow-hidden rounded-lg border border-fuchsia-300/65 bg-fuchsia-100/50 px-3 pb-1.5"
                style={{
                  left: timeline.music.startSeconds * pixelsPerSecond,
                  width: Math.max(
                    44,
                    (timeline.music.endSeconds - timeline.music.startSeconds) *
                      pixelsPerSecond,
                  ),
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
  icon: "video" | "audio" | "music";
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

export function EditingPreview({
  project,
  playheadSeconds,
  playing,
  onPlayingChange,
  onPlayheadChange,
  onProjectChange,
}: {
  project: ProjectDocument;
  playheadSeconds: number;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onPlayheadChange: (seconds: number) => void;
  onProjectChange: (project: ProjectDocument) => void;
}) {
  const timeline = project.editing.timeline;
  const duration = timeline ? timelineDuration(timeline) : 1;
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);
  const narrationAudioRefs = useRef(new Map<string, HTMLAudioElement>());
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const playheadRef = useRef(playheadSeconds);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const clip =
    timeline?.sceneClips.find(
      (candidate) =>
        playheadSeconds >= candidate.startSeconds &&
        playheadSeconds < candidate.startSeconds + candidate.durationSeconds,
    ) ?? timeline?.sceneClips.at(-1);
  const asset = project.assets.find(
    (candidate) => candidate.id === clip?.assetId,
  );
  const scene = project.scenes.find(
    (candidate) => candidate.id === clip?.sceneId,
  );
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
        : new Map<
            string,
            { startSeconds: number; durationSeconds: number }
          >(),
    [timeline],
  );

  useEffect(() => {
    playheadRef.current = playheadSeconds;
  }, [playheadSeconds]);

  useEffect(() => {
    if (!previewExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPreviewExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewExpanded]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const advance = (now: number) => {
      const video = videoRef.current;
      const next =
        video && asset?.kind === "video" && clip
          ? clip.startSeconds +
            Math.max(0, video.currentTime - clip.trimStartSeconds)
          : playheadRef.current + (now - previous) / 1000;
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
  }, [asset?.kind, clip, duration, onPlayheadChange, onPlayingChange, playing]);

  useEffect(() => {
    if (!clip) return;
    const expectedTime =
      clip.trimStartSeconds + Math.max(0, playheadSeconds - clip.startSeconds);
    for (const video of [videoRef.current, modalVideoRef.current]) {
      if (
        video &&
        (!playing || Math.abs(video.currentTime - expectedTime) > 0.35)
      ) {
        video.currentTime = expectedTime;
      }
    }
  }, [clip, playheadSeconds, playing, previewExpanded]);

  useEffect(() => {
    const videos = [videoRef.current, modalVideoRef.current].filter(
      (video): video is HTMLVideoElement => video !== null,
    );
    if (videos.length === 0 || !clip || asset?.kind !== "video") return;
    const synchronizers = videos.map((video) => {
      const synchronizeAndPlay = () => {
        const expectedTime =
          clip.trimStartSeconds +
          Math.max(0, playheadRef.current - clip.startSeconds);
        if (Math.abs(video.currentTime - expectedTime) > 0.05) {
          video.currentTime = expectedTime;
        }
        if (playing) void video.play().catch(() => undefined);
        else video.pause();
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA)
        synchronizeAndPlay();
      else
        video.addEventListener("loadedmetadata", synchronizeAndPlay, {
          once: true,
        });
      return { video, synchronizeAndPlay };
    });
    return () => {
      for (const { video, synchronizeAndPlay } of synchronizers) {
        video.removeEventListener("loadedmetadata", synchronizeAndPlay);
        video.pause();
      }
    };
  }, [asset?.id, asset?.kind, clip, playing, previewExpanded]);

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
      const expectedTime = sourceStartSeconds + Math.max(
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
        1,
        source?.startSeconds,
      );
    }
    synchronizeAudio(musicAudioRef.current, timeline?.music, 0.3);
  }, [narrationSources, playheadSeconds, playing, timeline]);

  const updateOutput = (aspectRatio: string, width: number, height: number) => {
    const next = structuredClone(project);
    next.output.settings.aspectRatio = aspectRatio;
    next.output.settings.width = width;
    next.output.settings.height = height;
    onProjectChange(next);
  };

  const playbackControls = (modal = false) => (
    <div className={`flex items-center gap-3 ${modal ? "w-full max-w-2xl" : "mt-3"}`}>
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
      <span className={`text-[10px] font-bold ${modal ? "text-white" : "text-slate-300"}`}>
        {timeLabel(playheadSeconds)} / {timeLabel(duration)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-linear-to-br from-slate-950 to-slate-800 p-3">
        <div className="relative mx-auto aspect-9/16 max-h-72 overflow-hidden rounded-xl bg-black">
          {asset?.kind === "image" && (
            <Image
              src={contentUrl(project.project.id, asset.relativePath)}
              alt={`${scene?.order ?? ""}번 장면 미리보기`}
              fill
              unoptimized
              sizes="180px"
              className="object-cover"
            />
          )}
          {asset?.kind === "video" && (
            <video
              key={asset.id}
              ref={videoRef}
              src={contentUrl(project.project.id, asset.relativePath)}
              muted
              playsInline
              preload="auto"
              className="h-full w-full object-cover"
            />
          )}
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
              <div className="relative min-h-0 flex-1 aspect-9/16 overflow-hidden rounded-2xl bg-black shadow-2xl">
                {asset?.kind === "image" && (
                  <Image
                    src={contentUrl(project.project.id, asset.relativePath)}
                    alt={`${scene?.order ?? ""}번 장면 확대 미리보기`}
                    fill
                    unoptimized
                    sizes="50vw"
                    className="object-cover"
                  />
                )}
                {asset?.kind === "video" && (
                  <video
                    key={`expanded-${asset.id}`}
                    ref={modalVideoRef}
                    src={contentUrl(project.project.id, asset.relativePath)}
                    muted
                    playsInline
                    preload="auto"
                    className="h-full w-full object-cover"
                  />
                )}
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
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-extrabold text-slate-800">출력 설정</p>
        <label className="mt-3 block text-[11px] font-bold text-slate-500">
          화면 비율
          <select
            value={project.output.settings.aspectRatio}
            onChange={(event) =>
              event.target.value === "9:16"
                ? updateOutput("9:16", 1080, 1920)
                : updateOutput("1:1", 1080, 1080)
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
                updateOutput(
                  project.output.settings.aspectRatio,
                  Number(event.target.value),
                  project.output.settings.height,
                )
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
                updateOutput(
                  project.output.settings.aspectRatio,
                  project.output.settings.width,
                  Number(event.target.value),
                )
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
            />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          {project.output.settings.width} × {project.output.settings.height}px
        </p>
      </div>
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
