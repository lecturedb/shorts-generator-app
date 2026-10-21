"use client";

import { useState } from "react";
import type { ProjectSummary } from "@/lib/project-management-types";
import type { ProjectDocument } from "@/lib/project-schema";
import type { ScriptGenerationInput } from "@/lib/script-generation-types";
import type { ImageConfigurationAction } from "@/lib/image-generation-types";
import type { VideoConfigurationAction } from "@/lib/video-generation-types";
import { Icon, type DashboardFile, type PanelContext } from "./shorts-dashboard-shared";
import { DetailPanel, SceneTable } from "./shorts-dashboard-detail";
import { SidebarContent } from "./shorts-dashboard-sidebar";
import { WorkflowEditor } from "./shorts-dashboard-workflow";

export interface DashboardViewProps {
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
  onGenerateImages: (sceneIds?: string[]) => void;
  onImageConfiguration: (action: ImageConfigurationAction) => void;
  onGenerateVideoPrompts: () => void;
  onGenerateVideos: (sceneIds?: string[]) => void;
  onVideoConfiguration: (action: VideoConfigurationAction) => void;
  configuredImageModel: string | null;
  configuredVideoModel: string | null;
}

export function DashboardView({
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
  onGenerateImages,
  onImageConfiguration,
  onGenerateVideoPrompts,
  onGenerateVideos,
  onVideoConfiguration,
  configuredImageModel,
  configuredVideoModel,
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
                configuredImageModel={configuredImageModel}
                configuredVideoModel={configuredVideoModel}
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
                onGenerateImages={onGenerateImages}
                onGenerateVideoPrompts={onGenerateVideoPrompts}
                onGenerateVideos={onGenerateVideos}
                configuredVideoModel={configuredVideoModel}
                configuredImageModel={configuredImageModel}
              />
            </div>
            </div>

            <SceneTable
              project={project}
              files={files}
              onFileSelect={selectFile}
              editable={panelContext === "step" && selectedStep.id === "script"}
              imageEditable={panelContext === "step" && selectedStep.id === "image"}
              videoEditable={panelContext === "step" && selectedStep.id === "video"}
              busy={busy}
              onSceneChange={updateScene}
              onGenerateImages={onGenerateImages}
              onImageConfiguration={onImageConfiguration}
              onGenerateVideos={onGenerateVideos}
              onVideoConfiguration={onVideoConfiguration}
            />

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

