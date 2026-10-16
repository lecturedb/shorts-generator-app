"use client";

import Image from "next/image";
import {
  ChevronDown,
  Ellipsis,
  FileText,
  Folder,
  House,
  Image as ImageIcon,
  LayoutGrid,
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
  Video,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { ProjectDocument, WorkflowStepId } from "@/lib/project-schema";

type IconName =
  | "audio"
  | "chevron"
  | "close"
  | "document"
  | "edit"
  | "folder"
  | "grid"
  | "home"
  | "image"
  | "menu"
  | "more"
  | "music"
  | "play"
  | "plus"
  | "save"
  | "search"
  | "settings"
  | "sparkles"
  | "video"
  | "wand";

type PanelContext = "file" | "step";

type WorkflowStep = ProjectDocument["workflow"]["steps"][number];
type WorkflowPosition = { x: number; y: number };
type WorkflowConnection = { id: string; source: string; target: string };
type DashboardFile = {
  id: string;
  label: string;
  kind: "json" | ProjectDocument["assets"][number]["kind"];
  stageId: "project" | WorkflowStepId;
  path: string;
  format: string;
  meta: string;
  stale: boolean;
};

const workflowCardWidth = 156;
const workflowCardHeight = 180;
const workflowBoardMinWidth = 1120;
const workflowBoardHeight = 330;

const allowedWorkflowTargets: Record<string, readonly string[]> = {
  script: ["image"],
  image: ["video", "voice", "music", "editing"],
  video: ["voice", "music", "editing"],
  voice: ["music", "editing"],
  music: ["editing"],
  editing: [],
};

function createInitialWorkflowPositions(steps: readonly WorkflowStep[]) {
  const positions: Record<string, WorkflowPosition> = {};
  steps.forEach((step, index) => {
    positions[step.id] = { x: 28 + index * 184, y: 72 };
  });
  return positions;
}

function createInitialWorkflowConnections(steps: readonly WorkflowStep[]): WorkflowConnection[] {
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
  folder: Folder,
  grid: LayoutGrid,
  home: House,
  image: ImageIcon,
  menu: Menu,
  more: Ellipsis,
  music: Music,
  play: Play,
  plus: Plus,
  save: Save,
  search: Search,
  settings: Settings,
  sparkles: Sparkles,
  video: Video,
  wand: WandSparkles,
};

const fileGroups: ReadonlyArray<{ label: string; stageId: DashboardFile["stageId"] }> = [
  { label: "프로젝트 정보", stageId: "project" },
  { label: "01 대본", stageId: "script" },
  { label: "02 이미지", stageId: "image" },
  { label: "03 영상", stageId: "video" },
  { label: "04 더빙", stageId: "voice" },
  { label: "05 음악", stageId: "music" },
  { label: "06 편집", stageId: "editing" },
] as const;

function createDashboardFiles(project: ProjectDocument): DashboardFile[] {
  return [
    { id: "project-json", label: "project.json", kind: "json", stageId: "project", path: "project.json", format: "JSON", meta: `스키마 v${project.schemaVersion}`, stale: false },
    { id: "script-data", label: "대본·장면 데이터", kind: "json", stageId: "script", path: "project.json / script · scenes", format: "JSON", meta: `장면 ${project.scenes.length}개`, stale: project.script.stale.isStale },
    ...project.assets.map((asset) => {
      const dimensions = asset.metadata.width && asset.metadata.height ? `${asset.metadata.width} × ${asset.metadata.height}` : null;
      const duration = asset.metadata.durationSeconds === undefined ? null : `${asset.metadata.durationSeconds}초`;
      return {
        id: asset.id,
        label: asset.label,
        kind: asset.kind,
        stageId: asset.stageId,
        path: asset.relativePath,
        format: asset.metadata.format,
        meta: [duration, dimensions, asset.selected ? "대표 자산" : null].filter(Boolean).join(" · ") || "메타데이터 없음",
        stale: asset.stale.isStale,
      };
    }),
  ];
}

function formatRunTime(value: string | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatRunDuration(startedAt: string | undefined, endedAt: string | undefined) {
  if (!startedAt || !endedAt) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" className={className} strokeWidth={1.8} />;
}

function StatusMark({ status, compact = false }: { status: string; compact?: boolean }) {
  if (status === "완료") {
    return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`} aria-label="완료">✓</span>;
  }
  if (status === "실행 중") {
    return <span className={`status-spinner shrink-0 rounded-full border-2 border-violet-200 border-t-violet-600 ${compact ? "h-5 w-5" : "h-6 w-6"}`} aria-label="실행 중" />;
  }
  if (status === "실패") {
    return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-600 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`} aria-label="실패">!</span>;
  }
  if (status === "취소됨") {
    return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`} aria-label="취소됨">×</span>;
  }
  if (status === "확인 필요") {
    return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-700 ${compact ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm"}`} aria-label="확인 필요">?</span>;
  }
  return <span className={`shrink-0 rounded-full border-2 border-slate-300 bg-white ${compact ? "h-5 w-5" : "h-6 w-6"}`} aria-label="대기" />;
}

function statusTextClass(status: string) {
  if (status === "완료") return "text-emerald-600";
  if (status === "실행 중") return "text-violet-600";
  if (status === "실패") return "text-rose-600";
  if (status === "확인 필요") return "text-amber-700";
  if (status === "취소됨") return "text-slate-600";
  return "text-slate-500";
}

function WorkflowEditor({
  steps,
  selectedStepId,
  onStepSelect,
}: {
  steps: readonly WorkflowStep[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const cardDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const connectionDragRef = useRef<{ source: string; x: number; y: number } | null>(null);
  const [positions, setPositions] = useState(() => createInitialWorkflowPositions(steps));
  const [connections, setConnections] = useState(() => createInitialWorkflowConnections(steps));
  const [connectionDrag, setConnectionDrag] = useState<{ source: string; x: number; y: number } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [notice, setNotice] = useState("카드는 이동할 수 있고, 오른쪽 연결점을 다른 카드의 왼쪽 연결점으로 드래그할 수 있습니다.");

  const pointInBoard = (clientX: number, clientY: number) => {
    const bounds = boardRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: clientX - bounds.left, y: clientY - bounds.top, width: bounds.width };
  };

  const startCardDrag = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const point = pointInBoard(event.clientX, event.clientY);
    if (!point) return;
    const position = positions[id];
    cardDragRef.current = { id, offsetX: point.x - position.x, offsetY: point.y - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCard = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cardDragRef.current;
    const point = pointInBoard(event.clientX, event.clientY);
    if (!drag || !point) return;
    const nextX = Math.min(Math.max(8, point.x - drag.offsetX), point.width - workflowCardWidth - 8);
    const nextY = Math.min(Math.max(8, point.y - drag.offsetY), workflowBoardHeight - workflowCardHeight - 8);
    setPositions((current) => ({ ...current, [drag.id]: { x: nextX, y: nextY } }));
  };

  const finishCardDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    cardDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startConnection = (event: ReactPointerEvent<HTMLButtonElement>, source: string) => {
    event.stopPropagation();
    const point = pointInBoard(event.clientX, event.clientY);
    if (!point) return;
    setSelectedConnectionId(null);
    const nextConnectionDrag = { source, x: point.x, y: point.y };
    connectionDragRef.current = nextConnectionDrag;
    setConnectionDrag(nextConnectionDrag);
    setNotice("연결할 카드의 왼쪽 연결점에서 놓으세요.");
  };

  const finishConnection = (event: ReactPointerEvent<HTMLButtonElement>, target: string) => {
    event.stopPropagation();
    const activeConnection = connectionDragRef.current;
    if (!activeConnection) return;
    const { source } = activeConnection;
    connectionDragRef.current = null;
    setConnectionDrag(null);
    if (!allowedWorkflowTargets[source]?.includes(target)) {
      setNotice("이 연결은 단계 순서 또는 필수 입력 의존성을 충족하지 않아 사용할 수 없습니다.");
      return;
    }

    const id = `${source}-${target}`;
    setConnections((current) => [
      ...current.filter((connection) => connection.source !== source && connection.target !== target),
      { id, source, target },
    ]);
    setSelectedConnectionId(id);
    setNotice("연결을 변경했습니다. 이 편집은 아직 실제 제작 실행 순서에는 반영되지 않습니다.");
  };

  const deleteSelectedConnection = () => {
    if (!selectedConnectionId) return;
    setConnections((current) => current.filter((connection) => connection.id !== selectedConnectionId));
    setSelectedConnectionId(null);
    setNotice("연결선을 삭제했습니다. 연결되지 않은 단계는 현재 제작 흐름에서 제외된 것으로 표시됩니다.");
  };

  const handleConnectionKeyDown = (event: KeyboardEvent<SVGPathElement>, connectionId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedConnectionId(connectionId);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      setConnections((current) => current.filter((connection) => connection.id !== connectionId));
      setSelectedConnectionId(null);
      setNotice("연결선을 삭제했습니다. 연결되지 않은 단계는 현재 제작 흐름에서 제외된 것으로 표시됩니다.");
    }
  };

  const connectionPath = (source: WorkflowPosition, target: WorkflowPosition) => {
    const startX = source.x + workflowCardWidth;
    const startY = source.y + workflowCardHeight / 2;
    const endX = target.x - 6;
    const endY = target.y + workflowCardHeight / 2;
    const curve = Math.min(170, Math.max(55, Math.abs(endX - startX) / 2));
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  };

  const stepLabel = (id: string) => steps.find((step) => step.id === id)?.label ?? id;

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="leading-5">{notice}</p>
        {selectedConnectionId && (
          <button type="button" onClick={deleteSelectedConnection} className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 font-bold text-rose-600 transition hover:bg-rose-50">
            선택 연결 삭제
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-slate-50 bg-[radial-gradient(circle_at_center,_#cbd5e1_1px,_transparent_1px)] bg-[length:20px_20px]">
        <div
          ref={boardRef}
          className="relative w-full select-none overflow-hidden"
          style={{ minWidth: workflowBoardMinWidth, height: workflowBoardHeight }}
          onPointerMove={(event) => {
            if (!connectionDragRef.current) return;
            const point = pointInBoard(event.clientX, event.clientY);
            if (point) {
              const nextConnectionDrag = { ...connectionDragRef.current, x: point.x, y: point.y };
              connectionDragRef.current = nextConnectionDrag;
              setConnectionDrag(nextConnectionDrag);
            }
          }}
          onPointerUp={() => {
            if (connectionDragRef.current) {
              connectionDragRef.current = null;
              setConnectionDrag(null);
              setNotice("연결이 취소되었습니다. 연결점은 다른 카드의 연결점에 놓아야 합니다.");
            }
          }}
          onPointerLeave={() => {
            if (connectionDragRef.current) {
              connectionDragRef.current = null;
              setConnectionDrag(null);
            }
          }}
        >
          <svg className="absolute inset-0 h-full w-full" aria-label="제작 단계 연결선">
            <defs>
              <marker id="workflow-arrow-line" viewBox="0 0 10 12" refX="9" refY="6" markerWidth="10" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 1 1 L 9 6 L 1 11" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
              <marker id="workflow-arrow-line-selected" viewBox="0 0 10 12" refX="9" refY="6" markerWidth="10" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 1 1 L 9 6 L 1 11" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {connections.map((connection) => {
              const source = positions[connection.source];
              const target = positions[connection.target];
              if (!source || !target) return null;
              const isSelected = selectedConnectionId === connection.id;
              return (
                <g key={connection.id} className={isSelected ? "text-violet-700" : "text-violet-500"}>
                  <path d={connectionPath(source, target)} fill="none" stroke="transparent" strokeWidth="16" className="cursor-pointer" onClick={() => setSelectedConnectionId(connection.id)} onKeyDown={(event) => handleConnectionKeyDown(event, connection.id)} tabIndex={0} role="button" aria-label={`${stepLabel(connection.source)}에서 ${stepLabel(connection.target)} 연결 선택`} />
                  <path d={connectionPath(source, target)} fill="none" stroke="currentColor" strokeWidth={isSelected ? 3 : 2} markerEnd={isSelected ? "url(#workflow-arrow-line-selected)" : "url(#workflow-arrow-line)"} className="pointer-events-none" />
                </g>
              );
            })}
            {connectionDrag && positions[connectionDrag.source] && (
              <path
                d={`M ${positions[connectionDrag.source].x + workflowCardWidth} ${positions[connectionDrag.source].y + workflowCardHeight / 2} L ${connectionDrag.x} ${connectionDrag.y}`}
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
            return (
              <article
                key={step.id}
                className={`group absolute rounded-2xl border bg-white shadow-md transition-shadow ${isSelected ? "border-violet-500 shadow-[0_10px_24px_rgba(124,58,237,0.22)]" : "border-slate-300 hover:border-violet-400 hover:shadow-lg"}`}
                style={{ width: workflowCardWidth, height: workflowCardHeight, transform: `translate(${position.x}px, ${position.y}px)` }}
              >
                <div
                  className={`flex h-8 touch-none cursor-grab items-center justify-center rounded-t-2xl border-b active:cursor-grabbing ${isSelected ? "border-violet-300 bg-violet-200 text-violet-600" : "border-violet-200 bg-violet-100 text-violet-500"}`}
                  onPointerDown={(event) => startCardDrag(event, step.id)}
                  onPointerMove={moveCard}
                  onPointerUp={finishCardDrag}
                  onPointerCancel={finishCardDrag}
                  title={`${step.label} 카드 이동`}
                >
                  <span className="text-sm tracking-[0.2em]" aria-hidden="true">•••</span>
                </div>
                <button type="button" onClick={() => onStepSelect(step.id)} className="h-[148px] w-full rounded-b-2xl bg-white p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500" aria-pressed={isSelected}>
                  <div className="flex items-start justify-between"><span className="text-xs font-black tracking-widest text-slate-400">{String(index + 1).padStart(2, "0")}</span><StatusMark status={step.status} compact /></div>
                  <span className={`mt-2 flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600 group-hover:bg-violet-100"}`}><Icon name={stepIcons[step.id] ?? "sparkles"} className="h-6 w-6" /></span>
                  <p className="mt-2 truncate text-sm font-extrabold text-slate-900">{step.label}</p>
                  <div className="mt-1 flex items-center justify-between gap-2"><span className={`text-[11px] font-bold ${statusTextClass(step.status)}`}>{step.status}</span><span className="truncate text-[10px] text-slate-400">{step.summary}</span></div>
                </button>
                <button type="button" onPointerUp={(event) => finishConnection(event, step.id)} className="absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center" aria-label={`${step.label} 입력 연결점`} title="입력 연결점">
                  <span className={`h-3 w-3 rounded-full border-2 bg-white transition ${connectionDrag ? "border-violet-600 shadow-[0_0_0_3px_rgba(139,92,246,0.18)]" : "border-slate-400"}`} />
                </button>
                <button type="button" onPointerDown={(event) => startConnection(event, step.id)} className="absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 touch-none items-center justify-center" aria-label={`${step.label} 출력 연결점에서 연결 시작`} title="드래그하여 연결">
                  <span className="h-3 w-3 rounded-full border-2 border-violet-600 bg-white transition" />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}

function fileIcon(kind: string): IconName {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "document";
}

function SidebarContent({ project, files, collapsed, onCollapse, onFileSelect, selectedFileId }: { project: ProjectDocument; files: readonly DashboardFile[]; collapsed: boolean; onCollapse: () => void; onFileSelect: (fileId: string) => void; selectedFileId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className={`relative flex h-20 shrink-0 items-center border-b border-slate-100 ${collapsed ? "justify-center px-3" : "justify-between px-5"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.24)]"><Icon name="play" className="h-6 w-6" /></span>
          {!collapsed && <span className="truncate text-[17px] font-extrabold tracking-tight text-slate-950">Shorts Studio</span>}
        </div>
        {collapsed ? (
          <button type="button" onClick={onCollapse} className="absolute -right-3 top-[62px] z-20 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-bold text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700 lg:inline-flex" aria-label="사이드바 펼치기" title="사이드바 펼치기">»</button>
        ) : (
          <button type="button" onClick={onCollapse} className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:inline-flex" aria-label="사이드바 접기" title="사이드바 접기"><span className="text-xl leading-none">«</span></button>
        )}
      </div>

      <nav className={`shrink-0 space-y-1.5 ${collapsed ? "p-3" : "px-4 py-4"}`} aria-label="주요 메뉴">
        <button type="button" className={`flex w-full items-center rounded-xl text-sm font-semibold text-slate-600 transition hover:bg-slate-50 ${collapsed ? "h-11 justify-center" : "h-11 gap-3 px-3"}`} aria-label="홈"><Icon name="home" />{!collapsed && <span>홈</span>}</button>
        <button type="button" className={`flex w-full items-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-[0_7px_16px_rgba(124,58,237,0.18)] ${collapsed ? "h-11 justify-center" : "h-11 gap-3 px-3"}`} aria-current="page" aria-label="프로젝트"><Icon name="folder" />{!collapsed && <span>프로젝트</span>}</button>
      </nav>

      {!collapsed && (
        <>
          <div className="flex shrink-0 gap-2 px-4 pb-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">프로젝트 검색</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input readOnly value="" placeholder="프로젝트 검색..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400" />
            </label>
            <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700" aria-label="새 프로젝트 추가" title="프로젝트 생성은 5단계에서 연결됩니다"><Icon name="plus" className="h-4 w-4" /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-extrabold text-slate-900"><Icon name="chevron" className="h-4 w-4" /><Icon name="folder" className="h-4 w-4 text-violet-600" /><span className="truncate">{project.project.name}</span></div>
            <div className="ml-5 border-l border-slate-200 pl-2">
              {fileGroups.map((group) => (
                <div key={group.label} className="mb-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-slate-600"><Icon name="chevron" className="h-3.5 w-3.5" /><Icon name="folder" className="h-4 w-4 text-amber-500" /><span>{group.label}</span></div>
                  {files.filter((file) => file.stageId === group.stageId).map((file) => {
                    const isSelected = file.id === selectedFileId;
                    return (
                      <button key={file.id} type="button" onClick={() => onFileSelect(file.id)} className={`flex w-full items-center gap-2 rounded-lg py-2 pl-9 pr-2 text-left text-[13px] transition ${isSelected ? "bg-violet-100 font-bold text-violet-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`} aria-pressed={isSelected}>
                        <Icon name={fileIcon(file.kind)} className={`h-4 w-4 shrink-0 ${file.kind === "video" ? "text-violet-600" : "text-sky-600"}`} /><span className="truncate">{file.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className={`mt-auto shrink-0 border-t border-slate-100 ${collapsed ? "space-y-1 p-3" : "space-y-1 px-4 py-3"}`}>
        {([["grid", "템플릿"], ["settings", "설정"]] as const).map(([icon, label]) => <button key={label} type="button" className={`flex w-full items-center rounded-xl text-sm font-semibold text-slate-600 transition hover:bg-slate-50 ${collapsed ? "h-10 justify-center" : "h-10 gap-3 px-3"}`} aria-label={label}><Icon name={icon} />{!collapsed && <span>{label}</span>}</button>)}
      </div>
    </div>
  );
}

function PreviewVisual({ kind }: { kind: string }) {
  if (kind === "image" || kind === "video") {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
        <Image src="/samples/scene-01.png" alt="보라색 세로형 샘플 장면" fill sizes="(max-width: 1024px) 100vw, 360px" className="object-cover opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
        {kind === "video" && <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-violet-700 shadow-lg"><Icon name="play" className="h-6 w-6" /></span>}
        <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">정적 샘플 미리보기</span>
      </div>
    );
  }
  if (kind === "audio") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-800 p-6 text-white">
        <div className="w-full">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/15"><Icon name="music" className="h-6 w-6" /></span>
          <div className="flex h-12 items-center justify-center gap-1" aria-hidden="true">{[5, 9, 7, 12, 8, 15, 10, 18, 12, 16, 9, 13, 7, 10, 5].map((height, index) => <span key={`${height}-${index}`} className="w-1.5 rounded-full bg-white/75" style={{ height: `${height * 2}px` }} />)}</div>
          <p className="mt-4 text-center text-xs font-semibold text-violet-100">오디오 플레이어는 6단계에서 연결됩니다</p>
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-2xl bg-slate-950 p-5 font-mono text-xs leading-6 text-violet-200">
      <p>{"{"}</p><p className="pl-4"><span className="text-sky-300">&quot;project&quot;</span>: <span className="text-amber-200">&quot;제주 숨은 명소 쇼츠&quot;</span>,</p><p className="pl-4"><span className="text-sky-300">&quot;status&quot;</span>: <span className="text-amber-200">&quot;샘플&quot;</span></p><p>{"}"}</p>
    </div>
  );
}

export function ShortsDashboard({ project }: { project: ProjectDocument }) {
  const files = createDashboardFiles(project);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState("video");
  const [selectedFileId, setSelectedFileId] = useState("asset-video-scene-01");
  const [panelContext, setPanelContext] = useState<PanelContext>("file");

  const selectedStep = project.workflow.steps.find((step) => step.id === selectedStepId) ?? project.workflow.steps[0];
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0];

  const selectFile = (fileId: string) => {
    setSelectedFileId(fileId);
    setPanelContext("file");
    setMobileSidebarOpen(false);
  };

  return (
    <div className="min-h-dvh bg-[#f5f6fa] text-slate-900">
      <div className="flex min-h-dvh">
        <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 lg:block ${sidebarCollapsed ? "w-[82px]" : "w-[270px]"}`}><SidebarContent project={project} files={files} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((value) => !value)} onFileSelect={selectFile} selectedFileId={selectedFileId} /></aside>

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={() => setMobileSidebarOpen(false)} aria-label="사이드바 닫기" />
            <aside className="relative h-full w-[min(86vw,320px)] border-r border-slate-200 bg-white shadow-2xl">
              <button type="button" onClick={() => setMobileSidebarOpen(false)} className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700" aria-label="사이드바 닫기"><Icon name="close" className="h-5 w-5" /></button>
              <SidebarContent project={project} files={files} collapsed={false} onCollapse={() => setMobileSidebarOpen(false)} onFileSelect={selectFile} selectedFileId={selectedFileId} />
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
            <button type="button" onClick={() => setMobileSidebarOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700" aria-label="메뉴 열기"><Icon name="menu" /></button>
            <div className="min-w-0 px-3 text-center"><p className="truncate text-sm font-extrabold text-slate-950">{project.project.name}</p><p className="text-[11px] font-medium text-slate-500">Shorts Studio</p></div>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white" aria-label="전체 작업 실행" title="실행 기능은 8단계에서 연결됩니다"><Icon name="play" /></button>
          </header>

          <main className="mx-auto w-full max-w-[1680px] p-4 sm:p-5 xl:p-7">
            <section className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">{project.project.name}</h1><button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-violet-600" aria-label="프로젝트 이름 변경" title="이름 변경은 5단계에서 연결됩니다"><Icon name="edit" className="h-4 w-4" /></button></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">{project.project.description}</p></div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex"><button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"><Icon name="folder" className="h-4 w-4" />프로젝트 열기</button><button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm"><Icon name="save" className="h-4 w-4" />저장</button><button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(124,58,237,0.24)]" title="실행 기능은 8단계에서 연결됩니다"><Icon name="play" className="h-4 w-4" />모든 작업 실행</button></div>
            </section>

            <section aria-labelledby="workflow-heading" className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Workflow</p><h2 id="workflow-heading" className="mt-1 text-lg font-extrabold text-slate-950">제작 흐름</h2></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">고정 6단계</span><span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 sm:inline">UI 편집 전용</span></div></div>
              <WorkflowEditor
                steps={project.workflow.steps}
                selectedStepId={panelContext === "step" ? selectedStep.id : null}
                onStepSelect={(stepId) => {
                  setSelectedStepId(stepId);
                  setPanelContext("step");
                }}
              />
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
              <section aria-labelledby="jobs-heading" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5"><div className="flex items-baseline gap-2"><h2 id="jobs-heading" className="text-lg font-extrabold text-slate-950">작업 목록</h2><span className="text-xs font-bold text-slate-400">{project.runs.length}개</span></div><button type="button" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">전체 상태<Icon name="chevron" className="h-3.5 w-3.5" /></button></div>
                <div className="hidden grid-cols-[100px_96px_minmax(200px,1fr)_110px_90px] gap-3 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 md:grid"><span>상태</span><span>단계</span><span>작업 내용</span><span>시작 시간</span><span>소요 시간</span></div>
                <div className="divide-y divide-slate-100">
                  {project.runs.map((run) => <div key={run.id} className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:px-5 md:grid-cols-[100px_96px_minmax(200px,1fr)_110px_90px] md:items-center"><div className="flex items-center gap-2"><StatusMark status={run.status} compact /><span className={`text-xs font-bold ${statusTextClass(run.status)}`}>{run.status}</span></div><span className="hidden text-sm font-extrabold text-slate-800 md:block">{project.workflow.steps.find((step) => step.id === run.stageId)?.label ?? run.stageId}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{run.label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{run.message}</p></div><div className="flex gap-4 text-xs text-slate-500 md:contents"><span><span className="mr-1 text-slate-400 md:hidden">시작</span>{formatRunTime(run.startedAt)}</span><span><span className="mr-1 text-slate-400 md:hidden">소요</span>{formatRunDuration(run.startedAt, run.endedAt)}</span></div></div>)}
                </div>
              </section>

              <aside aria-labelledby="detail-heading" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{panelContext === "file" ? "File preview" : "Step detail"}</p><h2 id="detail-heading" className="mt-1 truncate text-lg font-extrabold text-slate-950">{panelContext === "file" ? "선택한 파일 미리보기" : "선택한 단계"}</h2></div><button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500" aria-label="더 보기"><Icon name="more" className="h-5 w-5" /></button></div>
                {panelContext === "file" ? (
                  <>
                    <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Icon name={fileIcon(selectedFile.kind)} /></span><div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-900">{selectedFile.label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{selectedFile.path}</p></div></div>
                    <PreviewVisual kind={selectedFile.kind} />
                    <dl className="mt-4 grid grid-cols-[82px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-4 text-xs"><dt className="font-semibold text-slate-400">파일명</dt><dd className="truncate font-bold text-slate-800">{selectedFile.label}</dd><dt className="font-semibold text-slate-400">형식</dt><dd className="font-bold text-slate-800">{selectedFile.format}</dd><dt className="font-semibold text-slate-400">정보</dt><dd className="font-bold text-slate-800">{selectedFile.meta}</dd><dt className="font-semibold text-slate-400">상태</dt><dd className={`font-bold ${selectedFile.stale ? "text-amber-700" : "text-emerald-600"}`}>{selectedFile.stale ? "오래됨 · 확인 필요" : "샘플 준비됨"}</dd></dl>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 p-5 text-white"><div className="flex items-start justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Icon name={stepIcons[selectedStep.id] ?? "sparkles"} className="h-7 w-7" /></span><StatusMark status={selectedStep.status} compact /></div><p className="mt-6 text-xs font-bold text-violet-200">선택한 제작 단계</p><h3 className="mt-1 text-xl font-black">{selectedStep.label}</h3><p className="mt-2 text-sm text-violet-100">{selectedStep.summary}</p></div>
                    <div className="mt-4 space-y-3"><div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-400">현재 상태</p><div className="mt-2 flex items-center gap-2"><StatusMark status={selectedStep.status} compact /><span className={`text-sm font-extrabold ${statusTextClass(selectedStep.status)}`}>{selectedStep.status}</span></div></div><div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/60 p-4"><p className="text-sm font-extrabold text-violet-900">단계 설정과 실행</p><p className="mt-1 text-xs leading-5 text-violet-700">상세 설정은 7단계, 실제 실행 흐름은 8단계에서 연결됩니다.</p></div></div>
                  </>
                )}
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
