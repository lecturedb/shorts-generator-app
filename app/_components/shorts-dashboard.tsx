"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  House,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  Menu,
  Mic,
  Music,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Video,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  ProjectListResult,
  ProjectMutationResult,
  ProjectSummary,
  ProjectDeletionResult,
} from "@/lib/project-management-types";
import type {
  ProjectFileEntry,
  ProjectFilesResult,
} from "@/lib/project-file-types";
import type { ProjectDocument } from "@/lib/project-schema";
import type {
  ScriptGenerationInput,
  ScriptGenerationRunResult,
} from "@/lib/script-generation-types";

type IconName =
  | "audio"
  | "chevron"
  | "close"
  | "document"
  | "edit"
  | "expand"
  | "folder"
  | "folderOpen"
  | "grid"
  | "home"
  | "image"
  | "menu"
  | "music"
  | "play"
  | "plus"
  | "save"
  | "search"
  | "settings"
  | "sparkles"
  | "trash"
  | "video"
  | "wand";

type PanelContext = "file" | "step" | "script";

type WorkflowStep = ProjectDocument["workflow"]["steps"][number];
type WorkflowPosition = { x: number; y: number };
type WorkflowConnection = { id: string; source: string; target: string };
type WorkflowSize = "regular" | "compact" | "dense";
type DashboardFile = ProjectFileEntry;

const workflowMetrics: Record<
  WorkflowSize,
  {
    cardWidth: number;
    cardHeight: number;
    cardGap: number;
    boardMinWidth: number;
    cardTop: number;
  }
> = {
  regular: {
    cardWidth: 140,
    cardHeight: 150,
    cardGap: 0,
    boardMinWidth: 680,
    cardTop: 16,
  },
  compact: {
    cardWidth: 120,
    cardHeight: 142,
    cardGap: 0,
    boardMinWidth: 600,
    cardTop: 16,
  },
  dense: {
    cardWidth: 100,
    cardHeight: 134,
    cardGap: 0,
    boardMinWidth: 500,
    cardTop: 16,
  },
};

const allowedWorkflowTargets: Record<string, readonly string[]> = {
  script: ["image"],
  image: ["video", "voice", "music", "editing"],
  video: ["voice", "music", "editing"],
  voice: ["music", "editing"],
  music: ["editing"],
  editing: [],
};

function createInitialWorkflowPositions(
  steps: readonly WorkflowStep[],
  size: WorkflowSize,
  boardWidth = workflowMetrics[size].boardMinWidth,
) {
  const metrics = workflowMetrics[size];
  const positions: Record<string, WorkflowPosition> = {};
  const sidePadding = 24;
  const layoutWidth = Math.max(boardWidth, metrics.boardMinWidth);
  const minimumColumnGap = 8;
  const singleRowWidth =
    sidePadding * 2 +
    metrics.cardWidth * steps.length +
    minimumColumnGap * Math.max(0, steps.length - 1);
  const columnCount = layoutWidth >= singleRowWidth ? steps.length : 3;
  const columnGap =
    (layoutWidth - sidePadding * 2 - metrics.cardWidth * columnCount) /
    Math.max(1, columnCount - 1);
  const rowGap = 16;
  steps.forEach((step, index) => {
    const isSingleRowLayout = columnCount === steps.length;
    const column = isSingleRowLayout ? index : Math.floor(index / 2);
    const row = isSingleRowLayout ? 0 : index % 2;
    positions[step.id] = {
      x: sidePadding + column * (metrics.cardWidth + columnGap),
      y:
        isSingleRowLayout
          ? metrics.cardTop +
            (index % 2) * (metrics.cardHeight + rowGap)
          : metrics.cardTop + row * (metrics.cardHeight + rowGap),
    };
  });
  return positions;
}

function workflowColumnCount(
  stepCount: number,
  metrics: (typeof workflowMetrics)[WorkflowSize],
  boardWidth: number,
) {
  const singleRowWidth =
    48 + metrics.cardWidth * stepCount + 8 * Math.max(0, stepCount - 1);
  return boardWidth >= singleRowWidth ? stepCount : 3;
}

function createInitialWorkflowConnections(
  steps: readonly WorkflowStep[],
): WorkflowConnection[] {
  return steps.slice(0, -1).map((step, index) => ({
    id: `${step.id}-${steps[index + 1].id}`,
    source: step.id,
    target: steps[index + 1].id,
  }));
}

const stepIcons: Record<string, IconName> = {
  script: "document",
  image: "image",
  video: "video",
  voice: "audio",
  music: "music",
  editing: "wand",
};

const icons: Record<IconName, LucideIcon> = {
  audio: Mic,
  chevron: ChevronDown,
  close: X,
  document: FileText,
  edit: Pencil,
  expand: Maximize2,
  folder: Folder,
  folderOpen: FolderOpen,
  grid: LayoutGrid,
  home: House,
  image: ImageIcon,
  menu: Menu,
  music: Music,
  play: Play,
  plus: Plus,
  save: Save,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  trash: Trash2,
  video: Video,
  wand: WandSparkles,
};

const fileGroups: ReadonlyArray<{
  label: string;
  stageId: DashboardFile["stageId"];
}> = [
  { label: "프로젝트 정보", stageId: "project" },
  { label: "01 대본", stageId: "script" },
  { label: "02 이미지", stageId: "image" },
  { label: "03 영상", stageId: "video" },
  { label: "04 더빙", stageId: "voice" },
  { label: "05 음악", stageId: "music" },
  { label: "06 편집", stageId: "editing" },
] as const;

function formatFileSize(sizeBytes: number | undefined) {
  if (sizeBytes === undefined) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const IconComponent = icons[name];
  return (
    <IconComponent aria-hidden="true" className={className} strokeWidth={1.8} />
  );
}

function StatusMark({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  if (status === "완료") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`}
        aria-label="완료"
      >
        ✓
      </span>
    );
  }
  if (status === "실행 중") {
    return (
      <span
        className={`status-spinner shrink-0 rounded-full border-2 border-violet-200 border-t-violet-600 ${compact ? "h-5 w-5" : "h-6 w-6"}`}
        aria-label="실행 중"
      />
    );
  }
  if (status === "실패") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-600 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`}
        aria-label="실패"
      >
        !
      </span>
    );
  }
  if (status === "취소됨") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`}
        aria-label="취소됨"
      >
        ×
      </span>
    );
  }
  if (status === "확인 필요") {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-700 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`}
        aria-label="확인 필요"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 rounded-full border-2 border-slate-300 bg-white ${compact ? "h-5 w-5" : "h-6 w-6"}`}
      aria-label="대기"
    />
  );
}

function statusTextClass(status: string) {
  if (status === "완료") return "text-emerald-600";
  if (status === "실행 중") return "text-violet-600";
  if (status === "실패") return "text-rose-600";
  if (status === "확인 필요") return "text-amber-700";
  if (status === "취소됨") return "text-slate-600";
  return "text-slate-500";
}

function providerModelLabel(provider: string | null, model: string | null) {
  if (!model) return { provider: "서비스", model: "미연결" };
  const providerLabel = provider?.toLowerCase() === "openai" ? "OpenAI" : provider;
  return { provider: providerLabel ?? "제공사업자 미상", model };
}

function workflowModelLabel(project: ProjectDocument, stepId: string) {
  if (stepId === "script") {
    return providerModelLabel(project.script.provider, project.script.model);
  }
  if (stepId === "voice") {
    return providerModelLabel(project.voice.provider, project.voice.model);
  }
  if (stepId === "music") {
    return providerModelLabel(project.music.provider, project.music.model);
  }
  if (stepId === "editing") {
    return { provider: "실행 방식", model: "로컬 처리" };
  }
  return { provider: "서비스", model: "미연결" };
}

function WorkflowEditor({
  project,
  projectId,
  steps,
  selectedStepId,
  onStepSelect,
}: {
  project: ProjectDocument;
  projectId: string;
  steps: readonly WorkflowStep[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cardDragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const connectionDragRef = useRef<{
    source: string;
    x: number;
    y: number;
  } | null>(null);
  const layoutInitializedRef = useRef(false);
  const layoutCustomizedRef = useRef(false);
  const [workflowSize, setWorkflowSize] =
    useState<WorkflowSize>("regular");
  const [boardScale, setBoardScale] = useState(1);
  const metrics = workflowMetrics[workflowSize];
  const boardContentHeight =
    metrics.cardTop * 2 + metrics.cardHeight * 2 + 16;
  const [positions, setPositions] = useState(() =>
    createInitialWorkflowPositions(steps, "regular"),
  );
  const [connections, setConnections] = useState(() =>
    createInitialWorkflowConnections(steps),
  );
  const [connectionDrag, setConnectionDrag] = useState<{
    source: string;
    x: number;
    y: number;
  } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState(
    "카드는 이동할 수 있고, 오른쪽 연결점을 다른 카드의 왼쪽 연결점으로 드래그할 수 있습니다.",
  );
  const boardRequiredWidth = Math.max(
    metrics.boardMinWidth,
    ...Object.values(positions).map(
      (position) => position.x + metrics.cardWidth + 24,
    ),
  );
  const layoutStorageKey = `shorts-studio:workflow-layout:${projectId}`;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let currentSize: WorkflowSize = "regular";
    let animationFrame = 0;

    try {
      const storedValue = window.localStorage.getItem(layoutStorageKey);
      if (storedValue) {
        const parsed = JSON.parse(storedValue) as unknown;
        if (typeof parsed === "object" && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          const storedPositions = record.positions;
          const storedConnections = record.connections;
          if (
            record.version === 4 &&
            typeof storedPositions === "object" &&
            storedPositions !== null &&
            steps.every((step) => {
              const position = (storedPositions as Record<string, unknown>)[step.id];
              return (
                typeof position === "object" &&
                position !== null &&
                Number.isFinite((position as WorkflowPosition).x) &&
                Number.isFinite((position as WorkflowPosition).y)
              );
            })
          ) {
            // localStorage is the external source this effect synchronizes into React state.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPositions(storedPositions as Record<string, WorkflowPosition>);
            layoutInitializedRef.current = true;
            layoutCustomizedRef.current = true;
          }
          if (
            Array.isArray(storedConnections) &&
            storedConnections.every(
              (connection) =>
                typeof connection === "object" &&
                connection !== null &&
                typeof (connection as WorkflowConnection).id === "string" &&
                typeof (connection as WorkflowConnection).source === "string" &&
                typeof (connection as WorkflowConnection).target === "string",
            )
          ) {
            setConnections(storedConnections as WorkflowConnection[]);
          }
        }
      }
    } catch {
      window.localStorage.removeItem(layoutStorageKey);
    }

    let currentColumnCount = 0;
    const updateSize = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const width = viewport.clientWidth;
        const nextSize: WorkflowSize =
          width < 640 ? "dense" : width < 980 ? "compact" : "regular";
        const nextMetrics = workflowMetrics[nextSize];
        const nextBoardContentHeight =
          nextMetrics.cardTop * 2 + nextMetrics.cardHeight * 2 + 16;
        const nextScale = Math.min(
          1,
          width / nextMetrics.boardMinWidth,
          viewport.clientHeight / nextBoardContentHeight,
        );
        setBoardScale(nextScale);
        const logicalBoardWidth = width / nextScale;
        const nextColumnCount = workflowColumnCount(
          steps.length,
          nextMetrics,
          logicalBoardWidth,
        );
        if (
          !layoutInitializedRef.current ||
          (!layoutCustomizedRef.current &&
            (nextSize !== currentSize ||
              nextColumnCount !== currentColumnCount))
        ) {
          setPositions(
            createInitialWorkflowPositions(
              steps,
              nextSize,
              logicalBoardWidth,
            ),
          );
          layoutInitializedRef.current = true;
        }
        currentColumnCount = nextColumnCount;
        if (nextSize === currentSize) return;
        currentSize = nextSize;
        setWorkflowSize(nextSize);
      });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [layoutStorageKey, steps]);

  useEffect(() => {
    if (!layoutCustomizedRef.current) return;
    const saveTimer = window.setTimeout(() => {
      window.localStorage.setItem(
        layoutStorageKey,
        JSON.stringify({ version: 4, positions, connections }),
      );
    }, 150);
    return () => window.clearTimeout(saveTimer);
  }, [connections, layoutStorageKey, positions]);

  const pointInBoard = (clientX: number, clientY: number) => {
    const bounds = boardRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: (clientX - bounds.left) / boardScale,
      y: (clientY - bounds.top) / boardScale,
      width: bounds.width / boardScale,
      height: bounds.height / boardScale,
    };
  };

  const startCardDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    const point = pointInBoard(event.clientX, event.clientY);
    if (!point) return;
    layoutCustomizedRef.current = true;
    const position = positions[id];
    cardDragRef.current = {
      id,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCard = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cardDragRef.current;
    const point = pointInBoard(event.clientX, event.clientY);
    if (!drag || !point) return;
    const nextX = Math.min(
      Math.max(8, point.x - drag.offsetX),
      point.width - metrics.cardWidth - 8,
    );
    const nextY = Math.min(
      Math.max(8, point.y - drag.offsetY),
      point.height - metrics.cardHeight - 8,
    );
    setPositions((current) => ({
      ...current,
      [drag.id]: { x: nextX, y: nextY },
    }));
  };

  const finishCardDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    cardDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startConnection = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: string,
  ) => {
    event.stopPropagation();
    const point = pointInBoard(event.clientX, event.clientY);
    if (!point) return;
    setSelectedConnectionId(null);
    const nextConnectionDrag = { source, x: point.x, y: point.y };
    connectionDragRef.current = nextConnectionDrag;
    setConnectionDrag(nextConnectionDrag);
    setNotice("연결할 카드의 왼쪽 연결점에서 놓으세요.");
  };

  const finishConnection = (
    event: ReactPointerEvent<HTMLButtonElement>,
    target: string,
  ) => {
    event.stopPropagation();
    const activeConnection = connectionDragRef.current;
    if (!activeConnection) return;
    const { source } = activeConnection;
    connectionDragRef.current = null;
    setConnectionDrag(null);
    if (!allowedWorkflowTargets[source]?.includes(target)) {
      setNotice(
        "이 연결은 단계 순서 또는 필수 입력 의존성을 충족하지 않아 사용할 수 없습니다.",
      );
      return;
    }

    const id = `${source}-${target}`;
    layoutCustomizedRef.current = true;
    setConnections((current) => [
      ...current.filter(
        (connection) =>
          connection.source !== source && connection.target !== target,
      ),
      { id, source, target },
    ]);
    setSelectedConnectionId(id);
    setNotice(
      "연결을 변경했습니다. 이 편집은 아직 실제 제작 실행 순서에는 반영되지 않습니다.",
    );
  };

  const deleteSelectedConnection = () => {
    if (!selectedConnectionId) return;
    layoutCustomizedRef.current = true;
    setConnections((current) =>
      current.filter((connection) => connection.id !== selectedConnectionId),
    );
    setSelectedConnectionId(null);
    setNotice(
      "연결선을 삭제했습니다. 연결되지 않은 단계는 현재 제작 흐름에서 제외된 것으로 표시됩니다.",
    );
  };

  const handleConnectionKeyDown = (
    event: KeyboardEvent<SVGPathElement>,
    connectionId: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedConnectionId(connectionId);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      setConnections((current) =>
        current.filter((connection) => connection.id !== connectionId),
      );
      setSelectedConnectionId(null);
      setNotice(
        "연결선을 삭제했습니다. 연결되지 않은 단계는 현재 제작 흐름에서 제외된 것으로 표시됩니다.",
      );
    }
  };

  const connectionPath = (
    source: WorkflowPosition,
    target: WorkflowPosition,
  ) => {
    const startX = source.x + metrics.cardWidth;
    const startY = source.y + metrics.cardHeight / 2;
    const endX = target.x - 6;
    const endY = target.y + metrics.cardHeight / 2;
    const curve = Math.min(170, Math.max(55, Math.abs(endX - startX) / 2));
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  };

  const stepLabel = (id: string) =>
    steps.find((step) => step.id === id)?.label ?? id;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="leading-5">
          {notice}
        </p>
        {selectedConnectionId && (
          <button
            type="button"
            onClick={deleteSelectedConnection}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 font-bold text-rose-600 transition hover:bg-rose-50"
          >
            선택 연결 삭제
          </button>
        )}
      </div>
      <div
        ref={viewportRef}
        className="h-0 min-h-0 w-0 min-w-full flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border border-slate-300 bg-slate-50 bg-[radial-gradient(circle_at_center,#cbd5e1_1px,transparent_1px)] bg-size-[20px_20px]"
      >
        <div
          ref={boardRef}
          className="relative w-full select-none overflow-hidden"
          style={{
            width: `max(${100 / boardScale}%, ${boardRequiredWidth}px)`,
            minWidth: metrics.boardMinWidth,
            height: boardContentHeight,
            transform: `scale(${boardScale})`,
            transformOrigin: "top left",
          }}
          onPointerMove={(event) => {
            if (!connectionDragRef.current) return;
            const point = pointInBoard(event.clientX, event.clientY);
            if (point) {
              const nextConnectionDrag = {
                ...connectionDragRef.current,
                x: point.x,
                y: point.y,
              };
              connectionDragRef.current = nextConnectionDrag;
              setConnectionDrag(nextConnectionDrag);
            }
          }}
          onPointerUp={() => {
            if (connectionDragRef.current) {
              connectionDragRef.current = null;
              setConnectionDrag(null);
              setNotice(
                "연결이 취소되었습니다. 연결점은 다른 카드의 연결점에 놓아야 합니다.",
              );
            }
          }}
          onPointerLeave={() => {
            if (connectionDragRef.current) {
              connectionDragRef.current = null;
              setConnectionDrag(null);
            }
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            aria-label="제작 단계 연결선"
          >
            <defs>
              <marker
                id="workflow-arrow-line"
                viewBox="0 0 10 12"
                refX="9"
                refY="6"
                markerWidth="10"
                markerHeight="12"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path
                  d="M 1 1 L 9 6 L 1 11"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
              <marker
                id="workflow-arrow-line-selected"
                viewBox="0 0 10 12"
                refX="9"
                refY="6"
                markerWidth="10"
                markerHeight="12"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path
                  d="M 1 1 L 9 6 L 1 11"
                  fill="none"
                  stroke="#6d28d9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
            </defs>
            {connections.map((connection) => {
              const source = positions[connection.source];
              const target = positions[connection.target];
              if (!source || !target) return null;
              const isSelected = selectedConnectionId === connection.id;
              return (
                <g
                  key={connection.id}
                  className={isSelected ? "text-violet-700" : "text-violet-500"}
                >
                  <path
                    d={connectionPath(source, target)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="16"
                    className="cursor-pointer"
                    onClick={() => setSelectedConnectionId(connection.id)}
                    onKeyDown={(event) =>
                      handleConnectionKeyDown(event, connection.id)
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`${stepLabel(connection.source)}에서 ${stepLabel(connection.target)} 연결 선택`}
                  />
                  <path
                    d={connectionPath(source, target)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={isSelected ? 3 : 2}
                    markerEnd={
                      isSelected
                        ? "url(#workflow-arrow-line-selected)"
                        : "url(#workflow-arrow-line)"
                    }
                    className="pointer-events-none"
                  />
                </g>
              );
            })}
            {connectionDrag && positions[connectionDrag.source] && (
              <path
                d={`M ${positions[connectionDrag.source].x + metrics.cardWidth} ${positions[connectionDrag.source].y + metrics.cardHeight / 2} L ${connectionDrag.x} ${connectionDrag.y}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="7 6"
                className="text-violet-500"
              />
            )}
          </svg>

          {steps.map((step, index) => {
            const position = positions[step.id];
            const isSelected = selectedStepId === step.id;
            const modelInfo = workflowModelLabel(project, step.id);
            return (
              <article
                key={step.id}
                className={`group absolute rounded-2xl border bg-white shadow-md transition-shadow ${isSelected ? "border-violet-500 shadow-[0_10px_24px_rgba(124,58,237,0.22)]" : "border-slate-300 hover:border-violet-400 hover:shadow-lg"}`}
                style={{
                  width: metrics.cardWidth,
                  height: metrics.cardHeight,
                  transform: `translate(${position.x}px, ${position.y}px)`,
                }}
              >
                <div
                  className={`flex h-8 touch-none cursor-grab items-center gap-1.5 rounded-t-2xl border-b px-2 active:cursor-grabbing ${isSelected ? "border-violet-300 bg-violet-200 text-violet-700" : "border-violet-200 bg-violet-100 text-violet-600"}`}
                  onPointerDown={(event) => startCardDrag(event, step.id)}
                  onPointerMove={moveCard}
                  onPointerUp={finishCardDrag}
                  onPointerCancel={finishCardDrag}
                  title={`${step.label} 카드 이동`}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <Icon
                      name={stepIcons[step.id] ?? "sparkles"}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate text-xs font-extrabold text-slate-800">
                      {step.label}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onStepSelect(step.id)}
                  className="flex h-[calc(100%-2rem)] w-full min-w-0 flex-col overflow-hidden rounded-b-2xl bg-white px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
                  aria-pressed={isSelected}
                >
                  <div className="flex shrink-0 items-center justify-between">
                    <span className="text-[11px] font-black tracking-widest text-slate-400">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <StatusMark status={step.status} compact />
                  </div>
                  <div className="mt-1.5 w-full min-w-0 rounded-lg bg-slate-50 px-2 py-1.5">
                    <p className="truncate text-[10px] font-bold text-slate-400">
                      {modelInfo.provider}
                    </p>
                    <p className={`${workflowSize === "dense" ? "text-[10px]" : "text-[11px]"} line-clamp-2 min-w-0 break-all font-extrabold leading-4 text-slate-800`}>
                      {modelInfo.model}
                    </p>
                  </div>
                  <div className="mt-auto flex w-full min-w-0 items-center justify-between gap-1 pt-1">
                    <span
                      className={`shrink-0 text-[10px] font-bold ${statusTextClass(step.status)}`}
                    >
                      {step.status}
                    </span>
                    <span className="min-w-0 truncate text-[9px] text-slate-400">
                      {step.summary}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onPointerUp={(event) => finishConnection(event, step.id)}
                  className="absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center"
                  aria-label={`${step.label} 입력 연결점`}
                  title="입력 연결점"
                >
                  <span
                    className={`h-3 w-3 rounded-full border-2 bg-white transition ${connectionDrag ? "border-violet-600 shadow-[0_0_0_3px_rgba(139,92,246,0.18)]" : "border-slate-400"}`}
                  />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => startConnection(event, step.id)}
                  className="absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 touch-none items-center justify-center"
                  aria-label={`${step.label} 출력 연결점에서 연결 시작`}
                  title="드래그하여 연결"
                >
                  <span className="h-3 w-3 rounded-full border-2 border-violet-600 bg-white transition" />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fileIcon(kind: string): IconName {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "document";
}

interface SidebarContentProps {
  project: ProjectDocument;
  projects: readonly ProjectSummary[];
  files: readonly DashboardFile[];
  collapsed: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onProjectSelect: (projectId: string) => void;
  onCollapse: () => void;
  onFileSelect: (fileId: string) => void;
  onScriptSelect: () => void;
  selectedFileId: string;
  scriptSelected: boolean;
}

function SidebarContent({
  project,
  projects,
  files,
  collapsed,
  searchQuery,
  onSearchChange,
  onCreate,
  onProjectSelect,
  onCollapse,
  onFileSelect,
  onScriptSelect,
  selectedFileId,
  scriptSelected,
}: SidebarContentProps) {
  const [expandedGroups, setExpandedGroups] = useState<
    Set<DashboardFile["stageId"]>
  >(() => new Set(fileGroups.map((group) => group.stageId)));
  const filteredProjects = projects.filter((item) =>
    item.name
      .toLocaleLowerCase("ko-KR")
      .includes(searchQuery.trim().toLocaleLowerCase("ko-KR")),
  );
  return (
    <div className="project-sidebar flex h-full min-h-0 flex-col bg-white">
      <div
        className={`relative flex h-14 shrink-0 items-center border-b border-slate-100 ${collapsed ? "justify-center px-3" : "justify-between px-3.5"}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-violet-600 to-indigo-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.24)]">
            <Icon name="play" className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="sidebar-brand truncate font-extrabold tracking-tight text-slate-950">
              Shorts Studio
            </span>
          )}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={onCollapse}
            className="sidebar-expand-control absolute -right-3 top-10.5 z-20 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white font-bold text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700 sm:inline-flex"
            aria-label="사이드바 펼치기"
            title="사이드바 펼치기"
          >
            »
          </button>
        ) : (
          <button
            type="button"
            onClick={onCollapse}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            aria-label="사이드바 접기"
            title="사이드바 접기"
          >
            <span className="text-xl leading-none">«</span>
          </button>
        )}
      </div>

      <nav
        className={`shrink-0 space-y-0.5 ${collapsed ? "p-2.5" : "px-2.5 py-1.5"}`}
        aria-label="주요 메뉴"
      >
        <button
          type="button"
          className={`flex w-full items-center rounded-lg text-[8px] font-semibold leading-3 text-slate-600 transition hover:bg-slate-50 ${collapsed ? "h-9 justify-center" : "h-8 gap-2 px-2"}`}
          aria-label="홈"
        >
          <Icon name="home" className="h-3.5 w-3.5" />
          {!collapsed && <span>홈</span>}
        </button>
        <button
          type="button"
          className={`flex w-full items-center rounded-lg bg-violet-600 text-[8px] font-bold leading-3 text-white shadow-[0_7px_16px_rgba(124,58,237,0.18)] ${collapsed ? "h-9 justify-center" : "h-8 gap-2 px-2"}`}
          aria-current="page"
          aria-label="프로젝트"
        >
          <Icon name="folder" className="h-3.5 w-3.5" />
          {!collapsed && <span>프로젝트</span>}
        </button>
      </nav>

      {collapsed && (
        <button
          type="button"
          onClick={() => onProjectSelect(project.project.id)}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700"
          aria-label={`현재 프로젝트: ${project.project.name}`}
          title={`현재 프로젝트: ${project.project.name}`}
        >
          <Icon name="folderOpen" />
        </button>
      )}

      {!collapsed && (
        <>
          <div className="flex shrink-0 gap-1.5 px-2.5 pb-1.5">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">프로젝트 검색</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="프로젝트 검색..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[8px] leading-3 outline-none placeholder:text-slate-400 focus:border-violet-400"
              />
            </label>
            <button
              type="button"
              onClick={onCreate}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700"
              aria-label="새 프로젝트 추가"
            >
              <Icon name="plus" className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {filteredProjects.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-center text-[8px] leading-3 text-slate-500">
                검색 결과가 없습니다.
              </p>
            )}
            {filteredProjects.map((item) => {
              const isCurrent = item.id === project.project.id;
              return (
                <div key={item.id} className="mb-0.5">
                  <button
                    type="button"
                    onClick={() => onProjectSelect(item.id)}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[8px] leading-3 transition ${isCurrent ? "font-extrabold text-slate-900" : "font-semibold text-slate-600 hover:bg-slate-50"}`}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <Icon
                      name={isCurrent ? "chevron" : "folder"}
                      className="h-4 w-4 shrink-0"
                    />
                    <Icon
                      name="folder"
                      className={`h-4 w-4 shrink-0 ${isCurrent ? "text-violet-600" : "text-slate-400"}`}
                    />
                    <span className="truncate">{item.name}</span>
                  </button>
                  {isCurrent && (
                    <div className="ml-4 border-l border-slate-200 pl-1.5">
                      {fileGroups.map((group) => (
                        <div key={group.label}>
                          <button
                            type="button"
                            onClick={() => {
                              if (group.stageId === "script") onScriptSelect();
                              setExpandedGroups((current) => {
                                const next = new Set(current);
                                if (next.has(group.stageId))
                                  next.delete(group.stageId);
                                else next.add(group.stageId);
                                return next;
                              });
                            }}
                            className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left font-bold text-slate-600 hover:bg-slate-50"
                            aria-expanded={expandedGroups.has(group.stageId)}
                          >
                            <Icon
                              name="chevron"
                              className={`h-3.5 w-3.5 transition-transform ${expandedGroups.has(group.stageId) ? "" : "-rotate-90"}`}
                            />
                            <Icon
                              name="folder"
                              className="h-4 w-4 text-amber-500"
                            />
                            <span>{group.label}</span>
                          </button>
                          {expandedGroups.has(group.stageId) &&
                            (() => {
                              const groupFiles = files.filter(
                                (file) => file.stageId === group.stageId,
                              );
                              const hasScriptContent =
                                project.script.text.trim() !== "" ||
                                project.scenes.length > 0;
                              if (
                                group.stageId !== "script" &&
                                groupFiles.length === 0
                              ) {
                                return (
                                  <p className="py-1 pl-8 pr-2 text-[10px] text-slate-400">
                                    파일 없음
                                  </p>
                                );
                              }
                              return (
                                <>
                                  {group.stageId === "script" &&
                                    (hasScriptContent ? (
                                      <button
                                        type="button"
                                        onClick={onScriptSelect}
                                        className={`sidebar-file-row flex w-full items-center gap-1.5 rounded-lg pl-8 pr-1.5 text-left transition ${scriptSelected ? "bg-violet-100 font-bold text-violet-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                                        aria-pressed={scriptSelected}
                                      >
                                        <Icon
                                          name="document"
                                          className="h-3 w-3 shrink-0 text-violet-600"
                                        />
                                        <span className="truncate">전체 대본</span>
                                        <span className="sidebar-file-badge ml-auto shrink-0 rounded-full bg-emerald-50 px-1.5 font-bold text-emerald-700">
                                          {project.scenes.length}개 장면
                                        </span>
                                      </button>
                                    ) : (
                                      <p className="py-1 pl-8 pr-2 text-[10px] text-slate-400">
                                        아직 생성되지 않음
                                      </p>
                                    ))}
                                  {groupFiles.map((file) => {
                                    const isSelected = file.id === selectedFileId;
                                    return (
                                      <button
                                        key={file.id}
                                        type="button"
                                        onClick={() => onFileSelect(file.id)}
                                        className={`sidebar-file-row flex w-full items-center gap-1.5 rounded-lg pl-8 pr-1.5 text-left transition ${isSelected ? "bg-violet-100 font-bold text-violet-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                                        aria-pressed={isSelected}
                                      >
                                        <Icon
                                          name={fileIcon(file.kind)}
                                          className={`h-3 w-3 shrink-0 ${file.kind === "video" ? "text-violet-600" : "text-sky-600"}`}
                                        />
                                        <span className="truncate">
                                          {file.label}
                                        </span>
                                        {file.selected && (
                                          <span className="sidebar-file-badge ml-auto shrink-0 rounded-full bg-violet-100 px-1.5 font-bold text-violet-700">
                                            대표
                                          </span>
                                        )}
                                        {file.status !== "available" && (
                                          <span
                                            className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                            aria-label={
                                              file.status === "missing"
                                                ? "파일 누락"
                                                : "미지원 형식"
                                            }
                                          />
                                        )}
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div
        className={`mt-auto shrink-0 border-t border-slate-100 ${collapsed ? "space-y-0.5 p-2.5" : "space-y-0.5 px-2.5 py-1.5"}`}
      >
        {(
          [
            ["grid", "템플릿"],
            ["settings", "설정"],
          ] as const
        ).map(([icon, label]) => (
          <button
            key={label}
            type="button"
            className={`flex w-full items-center rounded-lg text-[8px] font-semibold leading-3 text-slate-600 transition hover:bg-slate-50 ${collapsed ? "h-8 justify-center" : "h-8 gap-2 px-2"}`}
            aria-label={label}
          >
            <Icon name={icon} className="h-3.5 w-3.5" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FileProblem({
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

function JsonReadablePreview({
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

function PreviewVisual({
  file,
  project,
}: {
  file: DashboardFile;
  project: ProjectDocument;
}) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [jsonView, setJsonView] = useState<"readable" | "raw">("readable");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const contentUrl = `/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(file.relativePath)}`;
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

  useEffect(() => {
    if (!imageExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setImageExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [imageExpanded]);

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
              className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
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
      <video
        key={contentUrl}
        controls
        preload="metadata"
        playsInline
        className="aspect-video w-full rounded-2xl bg-slate-950 object-contain"
        onError={() =>
          setMediaError(
            "영상 파일이 손상되었거나 브라우저가 코덱을 지원하지 않습니다.",
          )
        }
      >
        <source src={contentUrl} />
        브라우저에서 영상 재생을 지원하지 않습니다.
      </video>
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
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap wrap-break-word rounded-2xl bg-slate-950 p-5 text-xs leading-6 text-violet-100">
          {JSON.stringify(parsedJson, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SceneTable({
  project,
  files,
  onFileSelect,
  editable,
  onSceneChange,
}: {
  project: ProjectDocument;
  files: readonly DashboardFile[];
  onFileSelect: (fileId: string) => void;
  editable: boolean;
  onSceneChange: (
    sceneId: string,
    change: { narration?: string; visual?: string; imagePrompt?: string; durationSeconds?: number },
  ) => void;
}) {
  const assetLabel = (assetId: string | null) =>
    assetId === null
      ? "—"
      : (project.assets.find((asset) => asset.id === assetId)?.label ?? assetId);

  return (
    <section aria-labelledby="scenes-heading" className="max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-1.5 border-b border-slate-100 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Scene plan</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h2 id="scenes-heading" className="text-base font-extrabold text-slate-950">장면 구성표</h2>
            <span className="text-xs font-bold text-slate-400">{project.scenes.length}개</span>
          </div>
        </div>
        <p className="text-xs font-semibold text-slate-500">이미지 {project.scenes.filter((scene) => scene.image.status === "완료").length}/{project.scenes.length} 완료 · 영상 대상 {project.scenes.filter((scene) => scene.video.enabled).length}개</p>
      </div>
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-246 table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 py-2">장면</th><th className="px-2 py-2">시간</th><th className="px-2 py-2">내레이션</th><th className="px-2 py-2">시각적 내용 (한국어)</th><th className="px-2 py-2">이미지</th><th className="px-2 py-2">영상 설정</th><th className="px-2 py-2">영상 상태</th><th className="px-2 py-2">오류·재시도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {project.scenes.map((scene) => {
              const imageFile = files.find((file) => file.id === scene.selectedImageAssetId);
              const endScene = project.assets.find((asset) => asset.id === scene.video.endImageAssetId)?.sceneId;
              return (
                <tr key={scene.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-2 py-2"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 font-black text-violet-700">{scene.order}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 font-bold text-slate-700">
                    <span className="block">{scene.startSeconds}–{scene.startSeconds + scene.durationSeconds}초</span>
                    {editable && <label className="mt-2 block text-[11px] font-semibold text-slate-500">길이(초)<input type="number" min={0.1} step={0.1} value={scene.durationSeconds} onChange={(event) => onSceneChange(scene.id, { durationSeconds: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 px-1.5 py-1 text-xs text-slate-700" /></label>}
                  </td>
                  <td className="wrap-break-word px-2 py-2 leading-4 text-slate-700">{editable ? <textarea aria-label={`${scene.order}번 장면 내레이션`} value={scene.narration} onChange={(event) => onSceneChange(scene.id, { narration: event.target.value })} className="min-h-24 w-full resize-y rounded-lg border border-slate-200 p-2 text-xs leading-5" /> : scene.narration}</td>
                  <td className="wrap-break-word px-2 py-2 leading-4 text-slate-600">{editable ? <textarea aria-label={`${scene.order}번 장면 시각적 내용`} value={scene.visual} onChange={(event) => onSceneChange(scene.id, { visual: event.target.value })} className="min-h-24 w-full resize-y rounded-lg border border-slate-200 p-2 text-xs leading-5" /> : (scene.visual || "—")}</td>
                  <td className="px-2 py-2">
                    <button type="button" disabled={!imageFile} onClick={() => imageFile && onFileSelect(imageFile.id)} className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 text-left disabled:cursor-default">
                      {imageFile?.status === "available" ? <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded-md bg-slate-100"><Image src={`/api/projects/${project.project.id}/files/content?path=${encodeURIComponent(imageFile.relativePath)}`} alt="" fill unoptimized sizes="32px" className="object-cover" /></span> : <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400"><Icon name="image" className="h-4 w-4" /></span>}
                      <span><span className={`block font-extrabold ${statusTextClass(scene.image.status)}`}>{scene.image.status}</span><span className="mt-0.5 block text-[11px] text-slate-400">{assetLabel(scene.selectedImageAssetId)}</span></span>
                    </button>
                    {editable && <textarea aria-label={`${scene.order}번 장면 이미지 프롬프트`} value={typeof scene.image.input.prompt === "string" ? scene.image.input.prompt : ""} onChange={(event) => onSceneChange(scene.id, { imagePrompt: event.target.value })} className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 p-2 text-[11px] leading-4" />}
                  </td>
                  <td className="px-2 py-2">
                    {scene.video.enabled ? <div className="space-y-1"><span className="inline-flex rounded-full bg-violet-100 px-2 py-1 font-bold text-violet-700">영상 생성</span><p className="font-semibold text-slate-700">{scene.video.mode === "start_end" ? `${scene.order}번 → ${endScene ? Number(endScene.slice(-2)) : "?"}번 이미지` : `${scene.order}번 이미지 한 장`}</p></div> : <span className="text-slate-400">이미지 사용</span>}
                  </td>
                  <td className="px-2 py-2"><div className="flex items-center gap-1.5"><StatusMark status={scene.video.status} compact /><span className={`font-bold ${statusTextClass(scene.video.status)}`}>{scene.video.status}</span></div></td>
                  <td className="wrap-break-word px-2 py-2 text-slate-500">{scene.image.error ?? scene.video.error ?? "없음"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScriptStepPanel({
  project,
  busy,
  onProjectChange,
  onGenerate,
  onApplyScript,
}: {
  project: ProjectDocument;
  busy: boolean;
  onProjectChange: (project: ProjectDocument) => void;
  onGenerate: (input: ScriptGenerationInput) => void;
  onApplyScript: (narrations: string[]) => void;
}) {
  const scriptStep = project.workflow.steps.find((step) => step.id === "script");
  const sceneCountSetting = scriptStep?.settings.sceneCount;
  const toneSetting = scriptStep?.settings.tone;
  const sceneCount = typeof sceneCountSetting === "number" ? sceneCountSetting : (project.scenes.length || 7);
  const tone = typeof toneSetting === "string" ? toneSetting : "친근하고 명확한 설명체";
  const scriptDraftRef = useRef<HTMLTextAreaElement>(null);
  const [scriptDraftError, setScriptDraftError] = useState<string | null>(null);

  const updateSettings = (change: Partial<ScriptGenerationInput>) => {
    const next = structuredClone(project);
    const nextStep = next.workflow.steps.find((step) => step.id === "script");
    if (!nextStep) return;
    if (change.topic !== undefined) next.script.topic = change.topic;
    if (change.targetDurationSeconds !== undefined) {
      next.script.targetDurationSeconds = change.targetDurationSeconds;
      next.project.settings.targetDurationSeconds = change.targetDurationSeconds;
    }
    nextStep.settings = {
      ...nextStep.settings,
      ...(change.sceneCount === undefined ? {} : { sceneCount: change.sceneCount }),
      ...(change.tone === undefined ? {} : { tone: change.tone }),
    };
    onProjectChange(next);
  };

  const applyWholeScript = () => {
    const lines = (scriptDraftRef.current?.value ?? "").split(/\r?\n/).map((line) => line.trim());
    if (lines.length !== project.scenes.length || lines.some((line) => line === "")) {
      setScriptDraftError(`장면 수와 같은 ${project.scenes.length}개의 비어 있지 않은 줄이 필요합니다.`);
      return;
    }
    setScriptDraftError(null);
    onApplyScript(lines);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 p-4 text-white">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-violet-200">OpenAI 대본·장면 구성</p><h3 className="mt-1 text-lg font-black">{scriptStep?.status ?? "대기"}</h3></div><StatusMark status={scriptStep?.status ?? "대기"} compact /></div>
        <p className="mt-3 text-xs leading-5 text-violet-100">전체 대본과 이미지 기준 장면만 생성합니다. 영상 대상과 영상 프롬프트는 이번 단계에서 만들지 않습니다.</p>
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">주제<textarea value={project.script.topic} maxLength={500} onChange={(event) => updateSettings({ topic: event.target.value })} className="mt-1 min-h-20 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-normal" placeholder="예: 우주에서는 폭발음이 들릴까?" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-slate-700">목표 길이(초)<input type="number" min={10} max={180} step={1} value={project.script.targetDurationSeconds} onChange={(event) => updateSettings({ targetDurationSeconds: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" /></label>
          <label className="text-xs font-bold text-slate-700">장면 수<input type="number" min={1} max={20} step={1} value={sceneCount} onChange={(event) => updateSettings({ sceneCount: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" /></label>
        </div>
        <label className="block text-xs font-bold text-slate-700">말투<input value={tone} maxLength={100} onChange={(event) => updateSettings({ tone: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" placeholder="예: 친근하고 명확한 설명체" /></label>
        <button type="button" disabled={busy || !project.script.topic.trim()} onClick={() => onGenerate({ topic: project.script.topic, targetDurationSeconds: project.script.targetDurationSeconds, sceneCount, tone })} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Icon name="sparkles" className="h-4 w-4" />{project.scenes.length > 0 ? "다시 생성" : "생성"}</button>
      </div>
      {project.scenes.length > 0 && <div className="border-t border-slate-100 pt-4"><label className="block text-xs font-bold text-slate-700">전체 대본 <span className="font-normal text-slate-400">(장면마다 한 줄)</span><textarea key={project.script.text} ref={scriptDraftRef} defaultValue={project.scenes.map((scene) => scene.narration).join("\n")} className="mt-1 min-h-40 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6" /></label><button type="button" onClick={applyWholeScript} className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-violet-200 px-3 text-xs font-bold text-violet-700"><Icon name="save" className="h-3.5 w-3.5" />장면 내레이션에 반영</button>{scriptDraftError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{scriptDraftError}</p>}<p className="mt-2 text-[11px] leading-5 text-slate-500">장면 내레이션이 저장 기준이며 전체 대본은 장면 순서대로 자동 동기화됩니다. 수정 후 상단 저장 버튼을 눌러 확정하세요.</p></div>}
    </div>
  );
}

function DetailPanel({ project, selectedStep, selectedFile, context, busy, onProjectChange, onGenerate, onApplyScript }: { project: ProjectDocument; selectedStep: WorkflowStep; selectedFile: DashboardFile | undefined; context: PanelContext; busy: boolean; onProjectChange: (project: ProjectDocument) => void; onGenerate: (input: ScriptGenerationInput) => void; onApplyScript: (narrations: string[]) => void }) {
  return (
    <aside aria-labelledby="detail-heading" className="h-full min-w-0 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{context === "file" ? "File preview" : context === "script" ? "Script" : "Step detail"}</p>
      <h2 id="detail-heading" className="mt-1 mb-4 truncate text-lg font-extrabold text-slate-950">{context === "file" ? "선택한 파일 미리보기" : context === "script" ? "대본·장면 구성" : "선택한 단계"}</h2>
      {context === "step" && selectedStep.id === "script" ? (
        <ScriptStepPanel project={project} busy={busy} onProjectChange={onProjectChange} onGenerate={onGenerate} onApplyScript={onApplyScript} />
      ) : context === "script" ? (
        <div className="space-y-3"><div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 p-5 text-white"><p className="text-xs font-bold text-violet-200">전체 대본 · {project.script.targetDurationSeconds}초</p><h3 className="mt-2 text-xl font-black">{project.script.topic || "주제 미정"}</h3><p className="mt-4 max-h-72 overflow-auto text-sm leading-6 text-violet-50">{project.script.text || "대본이 없습니다."}</p></div><p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">장면 {project.scenes.length}개 · 이미지 대표 선택 {project.scenes.filter((scene) => scene.selectedImageAssetId).length}개</p></div>
      ) : context === "file" && selectedFile ? (
        <><div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Icon name={fileIcon(selectedFile.kind)} /></span><div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{selectedFile.label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{selectedFile.relativePath}</p></div></div><PreviewVisual key={selectedFile.id} file={selectedFile} project={project} /><dl className="mt-4 grid grid-cols-[70px_minmax(0,1fr)] gap-2 rounded-xl bg-slate-50 p-4 text-xs"><dt className="text-slate-400">형식</dt><dd className="font-bold">{selectedFile.format}</dd><dt className="text-slate-400">크기</dt><dd className="font-bold">{formatFileSize(selectedFile.sizeBytes)}</dd><dt className="text-slate-400">상태</dt><dd className="font-bold text-emerald-600">{selectedFile.status === "available" ? "사용 가능" : "확인 필요"}</dd></dl></>
      ) : (
        <div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 p-5 text-white"><div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Icon name={stepIcons[selectedStep.id] ?? "sparkles"} className="h-7 w-7" /></span><StatusMark status={selectedStep.status} compact /></div><p className="mt-6 text-xs font-bold text-violet-200">선택한 제작 단계</p><h3 className="mt-1 text-xl font-black">{selectedStep.label}</h3><p className="mt-2 text-sm text-violet-100">{selectedStep.summary}</p><p className="mt-5 rounded-xl bg-white/10 p-3 text-xs leading-5">설정 내용은 표시만 하며 실제 실행은 각 서비스 구현 단계에서 연결됩니다.</p></div>
      )}
    </aside>
  );
}

interface DashboardViewProps {
  project: ProjectDocument;
  projects: readonly ProjectSummary[];
  files: readonly DashboardFile[];
  searchQuery: string;
  busy: boolean;
  notice: string | null;
  error: string | null;
  onSearchChange: (value: string) => void;
  onCreate: () => void;
  onProjectSelect: (projectId: string) => void;
  onRename: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDismissMessage: () => void;
  onProjectChange: (project: ProjectDocument) => void;
  onGenerateScript: (input: ScriptGenerationInput) => void;
}

function DashboardView({
  project,
  projects,
  files,
  searchQuery,
  busy,
  notice,
  error,
  onSearchChange,
  onCreate,
  onProjectSelect,
  onRename,
  onSave,
  onDelete,
  onDismissMessage,
  onProjectChange,
  onGenerateScript,
}: DashboardViewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState("video");
  const [selectedFileId, setSelectedFileId] = useState(
    () =>
      files.find((file) => file.kind === "video" && file.status === "available")
        ?.id ??
      files.find((file) => file.status === "available")?.id ??
      files[0]?.id ??
      "",
  );
  const [panelContext, setPanelContext] = useState<PanelContext>("file");

  const selectedStep =
    project.workflow.steps.find((step) => step.id === selectedStepId) ??
    project.workflow.steps[0];
  const selectedFile =
    files.find((file) => file.id === selectedFileId) ?? files[0];

  const selectFile = (fileId: string) => {
    setSelectedFileId(fileId);
    setPanelContext("file");
    setMobileSidebarOpen(false);
  };
  const selectScript = () => {
    setPanelContext("script");
    setMobileSidebarOpen(false);
  };
  const selectProject = (projectId: string) => {
    onProjectSelect(projectId);
    setMobileSidebarOpen(false);
  };

  const markDownstreamStale = (next: ProjectDocument, reason: string) => {
    next.assets = next.assets.map((asset) => ({ ...asset, stale: { isStale: true, reason } }));
    for (const step of next.workflow.steps) {
      if (step.id !== "script" && step.status === "완료") {
        step.status = "확인 필요";
        step.summary = reason;
      }
    }
    if (next.voice.assetIds.length > 0) next.voice.status = "확인 필요";
    if (next.music.assetIds.length > 0) next.music.status = "확인 필요";
    if (next.output.assetId) {
      next.output.status = "확인 필요";
      next.output.stale = { isStale: true, reason };
      next.editing.status = "확인 필요";
    }
  };

  const updateScene = (sceneId: string, change: { narration?: string; visual?: string; imagePrompt?: string; durationSeconds?: number }) => {
    const next = structuredClone(project);
    const scene = next.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    if (change.narration !== undefined) scene.narration = change.narration;
    if (change.visual !== undefined) scene.visual = change.visual;
    if (change.imagePrompt !== undefined) scene.image.input.prompt = change.imagePrompt;
    if (change.durationSeconds !== undefined && Number.isFinite(change.durationSeconds) && change.durationSeconds >= 0.1) scene.durationSeconds = change.durationSeconds;
    let start = 0;
    next.scenes.sort((left, right) => left.order - right.order).forEach((candidate) => {
      candidate.startSeconds = start;
      candidate.editing.durationSeconds = candidate.durationSeconds;
      start += candidate.durationSeconds;
    });
    next.script.text = next.scenes.map((candidate) => candidate.narration.trim()).join(" ");
    next.script.targetDurationSeconds = start;
    next.project.settings.targetDurationSeconds = start;
    markDownstreamStale(next, "대본·장면 수동 수정으로 확인 필요");
    onProjectChange(next);
  };

  const applyWholeScript = (narrations: string[]) => {
    const next = structuredClone(project);
    next.scenes.forEach((scene, index) => { scene.narration = narrations[index]; });
    next.script.text = narrations.join(" ");
    markDownstreamStale(next, "전체 대본 수동 수정으로 확인 필요");
    onProjectChange(next);
  };

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#f5f6fa] text-slate-900">
      <div className="flex min-h-dvh w-full min-w-0 overflow-x-hidden">
        <aside
          className={`fixed inset-y-0 left-0 z-40 hidden h-dvh border-r border-slate-200 bg-white transition-[width] duration-200 ease-out sm:block ${sidebarCollapsed ? "w-17 overflow-visible" : "w-67.5 overflow-hidden"}`}
        >
          <div
            className={`h-full transition-[width] duration-200 ease-out ${sidebarCollapsed ? "w-17 overflow-visible" : "w-67.5 overflow-hidden"}`}
          >
            <SidebarContent
              project={project}
              projects={projects}
              files={files}
              collapsed={sidebarCollapsed}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              onCreate={onCreate}
              onProjectSelect={selectProject}
              onCollapse={() => setSidebarCollapsed((value) => !value)}
              onFileSelect={selectFile}
              onScriptSelect={selectScript}
              selectedFileId={panelContext === "file" ? selectedFileId : ""}
              scriptSelected={panelContext === "script"}
            />
          </div>
        </aside>
        <div
          aria-hidden="true"
          className={`hidden shrink-0 transition-[width] duration-200 ease-out sm:block ${sidebarCollapsed ? "w-17" : "w-67.5"}`}
        />

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 sm:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="사이드바 닫기"
            />
            <aside className="relative h-full w-[min(86vw,320px)] border-r border-slate-200 bg-white shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700"
                aria-label="사이드바 닫기"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
              <SidebarContent
                project={project}
                projects={projects}
                files={files}
                collapsed={false}
                searchQuery={searchQuery}
                onSearchChange={onSearchChange}
                onCreate={onCreate}
                onProjectSelect={selectProject}
                onCollapse={() => setMobileSidebarOpen(false)}
                onFileSelect={selectFile}
                onScriptSelect={selectScript}
                selectedFileId={panelContext === "file" ? selectedFileId : ""}
                scriptSelected={panelContext === "script"}
              />
            </aside>
          </div>
        )}

        <div
          className={`dashboard-content min-w-0 overflow-x-hidden ${sidebarCollapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}
        >
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:hidden">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700"
              aria-label="메뉴 열기"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0 px-3 text-center">
              <p className="truncate text-sm font-extrabold text-slate-950">
                {project.project.name}
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                Shorts Studio
              </p>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"
              aria-label="전체 작업 실행"
              title="실행 기능은 8단계에서 연결됩니다"
            >
              <Icon name="play" />
            </button>
          </header>

          <main className="w-full max-w-full min-w-0 overflow-x-hidden p-4 sm:p-5 xl:p-7">
            <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">
                    {project.project.name}
                  </h1>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onRename}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-violet-600 disabled:opacity-50"
                    aria-label="프로젝트 이름 변경"
                  >
                    <Icon name="edit" className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                  {project.project.description ||
                    "프로젝트 설명이 아직 없습니다."}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onSave}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm disabled:opacity-50"
                >
                  <Icon name="save" className="h-4 w-4" />
                  저장
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 shadow-sm disabled:opacity-50"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  삭제
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(124,58,237,0.24)]"
                  title="실행 기능은 8단계에서 연결됩니다"
                >
                  <Icon name="play" className="h-4 w-4" />
                  모든 작업 실행
                </button>
              </div>
            </section>

            <div className="mb-5 grid grid-cols-3 gap-2 sm:hidden">
              <button
                type="button"
                disabled={busy}
                onClick={onRename}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-50"
              >
                <Icon name="edit" className="h-4 w-4" />
                이름 변경
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onSave}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-50"
              >
                <Icon name="save" className="h-4 w-4" />
                저장
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white text-xs font-bold text-rose-600 disabled:opacity-50"
              >
                <Icon name="trash" className="h-4 w-4" />
                삭제
              </button>
            </div>

            <div
              className="production-workspace mb-5 max-w-full min-w-0 gap-4"
              style={{
                display: "block",
                position: "relative",
                width: "100%",
                maxWidth: "100%",
                height: "clamp(26rem, calc(100dvh - 15rem), 32rem)",
                minHeight: "26rem",
                maxHeight: "32rem",
                overflow: "hidden",
              }}
            >
            <section
              aria-labelledby="workflow-heading"
              className="workflow-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5"
              style={{
                position: "absolute",
                inset: "0 336px 0 0",
                width: "auto",
                minWidth: 0,
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">
                    Workflow
                  </p>
                  <h2
                    id="workflow-heading"
                    className="mt-1 text-lg font-extrabold text-slate-950"
                  >
                    제작 흐름
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                    고정 6단계
                  </span>
                  <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 sm:inline">
                    UI 편집 전용
                  </span>
                </div>
              </div>
              <WorkflowEditor
                key={project.project.id}
                project={project}
                projectId={project.project.id}
                steps={project.workflow.steps}
                selectedStepId={
                  panelContext === "step" ? selectedStep.id : null
                }
                onStepSelect={(stepId) => {
                  setSelectedStepId(stepId);
                  setPanelContext("step");
                }}
              />
            </section>
            <div
              className="preview-panel relative z-10 h-full min-h-0 min-w-0 overflow-hidden bg-[#f5f6fa]"
              style={{
                position: "absolute",
                inset: "0 0 0 auto",
                width: 320,
                minWidth: 0,
              }}
            >
              <DetailPanel
                project={project}
                selectedStep={selectedStep}
                selectedFile={selectedFile}
                context={panelContext}
                busy={busy}
                onProjectChange={onProjectChange}
                onGenerate={onGenerateScript}
                onApplyScript={applyWholeScript}
              />
            </div>
            </div>

            <SceneTable project={project} files={files} onFileSelect={selectFile} editable={panelContext === "step" && selectedStep.id === "script"} onSceneChange={updateScene} />

          </main>
        </div>
      </div>
      {(notice || error) && (
        <div
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={`fixed inset-x-4 bottom-4 z-60 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-semibold shadow-[0_18px_50px_rgba(15,23,42,0.2)] sm:left-auto sm:right-5 sm:w-[min(26rem,calc(100vw-2.5rem))] ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-white text-emerald-700"}`}
        >
          <p className="min-w-0 flex-1 leading-5">{error ?? notice}</p>
          <button
            type="button"
            onClick={onDismissMessage}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-current/70 hover:bg-black/5 hover:text-current"
            aria-label="메시지 닫기"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "요청을 처리할 수 없습니다.";
    throw new Error(message);
  }
  return body as T;
}

function EmptyWorkspace({
  loading,
  error,
  onCreate,
}: {
  loading: boolean;
  error: string | null;
  onCreate: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f6fa] p-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <Icon name="folderOpen" className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-black text-slate-950">
          {loading
            ? "프로젝트를 불러오는 중입니다"
            : "아직 프로젝트가 없습니다"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {loading
            ? "로컬 프로젝트 저장소를 확인하고 있습니다."
            : "새 프로젝트를 만들면 대본부터 최종 편집까지 한곳에서 관리할 수 있습니다."}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
          >
            {error}
          </p>
        )}
        {!loading && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white"
          >
            <Icon name="plus" className="h-4 w-4" />새 프로젝트 만들기
          </button>
        )}
      </section>
    </main>
  );
}

export function ShortsDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice && !error) return;
    const timeoutId = window.setTimeout(
      () => {
        setNotice(null);
        setError(null);
      },
      error ? 8_000 : 5_000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [notice, error]);

  const showError = (caught: unknown) => {
    setNotice(null);
    setError(
      caught instanceof Error ? caught.message : "요청을 처리할 수 없습니다.",
    );
  };

  const openProject = async (projectId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const [projectResponse, filesResponse] = await Promise.all([
        requestJson<{ project: ProjectDocument }>(`/api/projects/${projectId}`),
        requestJson<ProjectFilesResult>(`/api/projects/${projectId}/files`),
      ]);
      setProject(projectResponse.project);
      setFiles(filesResponse.files);
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      try {
        const result = await requestJson<ProjectListResult>("/api/projects");
        if (!active) return;
        setProjects(result.projects);
        if (result.errors.length > 0)
          setError(
            `${result.errors.length}개 프로젝트를 읽지 못했습니다. 손상된 폴더는 유지했습니다.`,
          );
        if (result.projects[0]) {
          const projectId = result.projects[0].id;
          const [projectResponse, filesResponse] = await Promise.all([
            requestJson<{ project: ProjectDocument }>(
              `/api/projects/${projectId}`,
            ),
            requestJson<ProjectFilesResult>(`/api/projects/${projectId}/files`),
          ]);
          if (active) {
            setProject(projectResponse.project);
            setFiles(filesResponse.files);
          }
        }
      } catch (caught) {
        if (active) showError(caught);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const createNewProject = async () => {
    const name = window.prompt(
      "새 프로젝트 이름을 입력하세요.",
      "새 쇼츠 프로젝트",
    );
    if (name === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const filesResponse = await requestJson<ProjectFilesResult>(
        `/api/projects/${result.project.project.id}/files`,
      );
      setProjects(result.projects);
      setProject(result.project);
      setFiles(filesResponse.files);
      setSearchQuery("");
      setNotice("새 프로젝트를 만들고 로컬 저장소에 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  const renameCurrentProject = async () => {
    if (!project) return;
    const name = window.prompt(
      "새 프로젝트 이름을 입력하세요.",
      project.project.name,
    );
    if (name === null || name === project.project.name) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(
        `/api/projects/${project.project.id}`,
        { method: "PUT", body: JSON.stringify({ action: "rename", name }) },
      );
      setProjects(result.projects);
      setProject(result.project);
      const filesResponse = await requestJson<ProjectFilesResult>(
        `/api/projects/${result.project.project.id}/files`,
      );
      setFiles(filesResponse.files);
      setNotice("프로젝트 이름을 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentProject = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(
        `/api/projects/${project.project.id}`,
        { method: "PUT", body: JSON.stringify({ action: "save", project }) },
      );
      setProjects(result.projects);
      setProject(result.project);
      const filesResponse = await requestJson<ProjectFilesResult>(
        `/api/projects/${result.project.project.id}/files`,
      );
      setFiles(filesResponse.files);
      setNotice("프로젝트를 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const generateScript = async (input: ScriptGenerationInput) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice("OpenAI에 대본과 장면 구성을 요청했습니다. 작업 ID로 상태를 확인하고 있습니다.");
    const requestId = crypto.randomUUID();
    try {
      const started = await requestJson<ScriptGenerationRunResult>(
        `/api/projects/${project.project.id}/script-runs`,
        { method: "POST", body: JSON.stringify({ requestId, input }) },
      );
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 120 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<ScriptGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/script-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      if (latest.status === "완료") {
        setNotice(`${latest.project.scenes.length}개 장면과 이미지 프롬프트를 생성해 project.json에 저장했습니다.`);
      } else if (latest.status === "실패" || latest.status === "확인 필요") {
        const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
        throw new Error(run?.errorSummary ?? run?.message ?? "대본 생성 결과를 확인해 주세요.");
      } else {
        setNotice("생성 작업은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
      }
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentProject = async () => {
    if (!project) return;
    const confirmed = window.confirm(
      `'${project.project.name}' 프로젝트를 영구 삭제합니다.\n\nproject.json, 대본 데이터, 실행 이력과 미디어 ${project.assets.length}개가 모두 삭제되며 복구할 수 없습니다. 계속할까요?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectDeletionResult>(
        `/api/projects/${project.project.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ confirmProjectId: project.project.id }),
        },
      );
      setProjects(result.projects);
      setSearchQuery("");
      setNotice(
        `프로젝트와 파일 ${result.deletedFileCount}개를 영구 삭제했습니다.`,
      );
      if (result.projects[0]) {
        const projectId = result.projects[0].id;
        const [projectResponse, filesResponse] = await Promise.all([
          requestJson<{ project: ProjectDocument }>(
            `/api/projects/${projectId}`,
          ),
          requestJson<ProjectFilesResult>(`/api/projects/${projectId}/files`),
        ]);
        setProject(projectResponse.project);
        setFiles(filesResponse.files);
      } else {
        setProject(null);
        setFiles([]);
      }
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (!project)
    return (
      <EmptyWorkspace
        loading={loading || busy}
        error={error}
        onCreate={() => void createNewProject()}
      />
    );

  return (
    <DashboardView
      key={project.project.id}
      project={project}
      projects={projects}
      files={files}
      searchQuery={searchQuery}
      busy={busy}
      notice={notice}
      error={error}
      onSearchChange={setSearchQuery}
      onCreate={() => void createNewProject()}
      onProjectSelect={(projectId) => void openProject(projectId)}
      onRename={() => void renameCurrentProject()}
      onSave={() => void saveCurrentProject()}
      onDelete={() => void deleteCurrentProject()}
      onDismissMessage={() => {
        setNotice(null);
        setError(null);
      }}
      onProjectChange={setProject}
      onGenerateScript={(input) => void generateScript(input)}
    />
  );
}
