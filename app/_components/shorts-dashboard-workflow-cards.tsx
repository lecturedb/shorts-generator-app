"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProjectDocument } from "@/lib/project-schema";
import { Icon, StatusMark, statusTextClass, stepIcons, workflowModelLabel, type WorkflowPosition, type WorkflowSize, type WorkflowStep } from "./shorts-dashboard-shared";

type WorkflowCardsProps = {
  project: ProjectDocument;
  configuredImageModel: string | null;
  configuredVideoModel: string | null;
  configuredVoiceModel: string | null;
  configuredMusicModel: string | null;
  steps: readonly WorkflowStep[];
  positions: Record<string, WorkflowPosition>;
  selectedStepId: string | null;
  metrics: { cardWidth: number; cardHeight: number };
  workflowSize: WorkflowSize;
  connectionDrag: { source: string; x: number; y: number } | null;
  onStepSelect: (stepId: string) => void;
  onCardDragStart: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void;
  onCardDragMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCardDragEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onConnectionFinish: (event: ReactPointerEvent<HTMLButtonElement>, target: string) => void;
  onConnectionStart: (event: ReactPointerEvent<HTMLButtonElement>, source: string) => void;
};

export function WorkflowCards({ project, configuredImageModel, configuredVideoModel, configuredVoiceModel, configuredMusicModel, steps, positions, selectedStepId, metrics, workflowSize, connectionDrag, onStepSelect, onCardDragStart, onCardDragMove, onCardDragEnd, onConnectionFinish, onConnectionStart }: WorkflowCardsProps) {
  return (
    <>
      {steps.map((step, index) => {
            const position = positions[step.id];
            const isSelected = selectedStepId === step.id;
            const modelInfo = workflowModelLabel(project, step.id, configuredImageModel, configuredVideoModel, configuredVoiceModel, configuredMusicModel);
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
                  onPointerDown={(event) => onCardDragStart(event, step.id)}
                  onPointerMove={onCardDragMove}
                  onPointerUp={onCardDragEnd}
                  onPointerCancel={onCardDragEnd}
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
                    <p
                      className={`${workflowSize === "dense" ? "text-[10px]" : "text-[11px]"} block w-full min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap font-extrabold leading-4 text-slate-800`}
                      title={modelInfo.model}
                    >
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
                  onPointerUp={(event) => onConnectionFinish(event, step.id)}
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
                  onPointerDown={(event) => onConnectionStart(event, step.id)}
                  className="absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 touch-none items-center justify-center"
                  aria-label={`${step.label} 출력 연결점에서 연결 시작`}
                  title="드래그하여 연결"
                >
                  <span className="h-3 w-3 rounded-full border-2 border-violet-600 bg-white transition" />
                </button>
              </article>
            );
      })}
    </>
  );
}

