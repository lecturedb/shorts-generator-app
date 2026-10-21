"use client";

import { useState } from "react";
import type { ProjectSummary } from "@/lib/project-management-types";
import type { ProjectDocument } from "@/lib/project-schema";
import { Icon, fileGroups, fileIcon, type DashboardFile } from "./shorts-dashboard-shared";

export interface SidebarContentProps {
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

export function SidebarContent({
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

