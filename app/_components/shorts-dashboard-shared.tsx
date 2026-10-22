import {
  Check, ChevronDown, Copy, FileText, Folder, FolderOpen, House, Image as ImageIcon,
  LayoutGrid, Maximize2, Menu, Mic, Music, Pencil, Play, Plus, Save,
  Search, Settings, Sparkles, Trash2, Video, WandSparkles, X,
  type LucideIcon,
} from "lucide-react";

import type { ProjectFileEntry } from "@/lib/project-file-types";
import type { ProjectDocument } from "@/lib/project-schema";

export type IconName =
  | "audio"
  | "check"
  | "chevron"
  | "close"
  | "copy"
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

export type PanelContext = "file" | "step" | "script";

export type WorkflowStep = ProjectDocument["workflow"]["steps"][number];
export type WorkflowPosition = { x: number; y: number };
export type WorkflowConnection = { id: string; source: string; target: string };
export type WorkflowSize = "regular" | "compact" | "dense";
export type DashboardFile = ProjectFileEntry;

export const workflowMetrics: Record<
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

export const allowedWorkflowTargets: Record<string, readonly string[]> = {
  script: ["image"],
  image: ["video", "voice", "music", "editing"],
  video: ["voice", "music", "editing"],
  voice: ["music", "editing"],
  music: ["editing"],
  editing: [],
};

export function createInitialWorkflowPositions(
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

export function workflowColumnCount(
  stepCount: number,
  metrics: (typeof workflowMetrics)[WorkflowSize],
  boardWidth: number,
) {
  const singleRowWidth =
    48 + metrics.cardWidth * stepCount + 8 * Math.max(0, stepCount - 1);
  return boardWidth >= singleRowWidth ? stepCount : 3;
}

export function createInitialWorkflowConnections(
  steps: readonly WorkflowStep[],
): WorkflowConnection[] {
  return steps.slice(0, -1).map((step, index) => ({
    id: `${step.id}-${steps[index + 1].id}`,
    source: step.id,
    target: steps[index + 1].id,
  }));
}

export const stepIcons: Record<string, IconName> = {
  script: "document",
  image: "image",
  video: "video",
  voice: "audio",
  music: "music",
  editing: "wand",
};

export const icons: Record<IconName, LucideIcon> = {
  audio: Mic,
  check: Check,
  chevron: ChevronDown,
  close: X,
  copy: Copy,
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

export const fileGroups: ReadonlyArray<{
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

export function formatFileSize(sizeBytes: number | undefined) {
  if (sizeBytes === undefined) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(kind: string): IconName {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "document";
}

export function Icon({
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

export function StatusMark({
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

export function statusTextClass(status: string) {
  if (status === "완료") return "text-emerald-600";
  if (status === "실행 중") return "text-violet-600";
  if (status === "실패") return "text-rose-600";
  if (status === "확인 필요") return "text-amber-700";
  if (status === "취소됨") return "text-slate-600";
  return "text-slate-500";
}

export function providerModelLabel(provider: string | null, model: string | null) {
  if (!model) return { provider: "서비스", model: "미연결" };
  const providerLabel = provider?.toLowerCase() === "openai" ? "OpenAI" : provider;
  return { provider: providerLabel ?? "제공사업자 미상", model };
}

export function workflowModelLabel(project: ProjectDocument, stepId: string, configuredImageModel: string | null = null, configuredVideoModel: string | null = null, configuredVoiceModel: string | null = null) {
  if (stepId === "script") {
    return providerModelLabel(project.script.provider, project.script.model);
  }
  if (stepId === "voice") {
    return providerModelLabel(project.voice.provider ?? (configuredVoiceModel ? "fal.ai" : null), project.voice.model ?? configuredVoiceModel);
  }
  if (stepId === "music") {
    return providerModelLabel(project.music.provider, project.music.model);
  }
  if (stepId === "image") {
    const step = project.workflow.steps.find((candidate) => candidate.id === "image");
    const configuredModel = typeof step?.settings.model === "string" ? step.settings.model : null;
    return { provider: "fal.ai", model: configuredModel ?? configuredImageModel ?? "모델 미설정" };
  }
  if (stepId === "video") {
    const step = project.workflow.steps.find((candidate) => candidate.id === "video");
    const configuredModel = typeof step?.settings.model === "string" ? step.settings.model : null;
    return { provider: "fal.ai", model: configuredModel ?? configuredVideoModel ?? "모델 미설정" };
  }
  if (stepId === "editing") {
    return { provider: "실행 방식", model: "로컬 처리" };
  }
  return { provider: "서비스", model: "미연결" };
}

