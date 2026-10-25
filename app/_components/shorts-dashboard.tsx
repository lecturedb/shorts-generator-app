"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProjectFileEntry, ProjectFilesResult } from "@/lib/project-file-types";
import type { ProjectDeletionResult, ProjectListResult, ProjectMutationResult, ProjectSummary } from "@/lib/project-management-types";
import type { ProjectDocument } from "@/lib/project-schema";
import type { ProjectTemplate, TemplateListResult } from "@/lib/template-types";
import type { ScriptGenerationInput, ScriptGenerationRunResult } from "@/lib/script-generation-types";
import type { ImageConfigurationAction, ImageGenerationRunResult } from "@/lib/image-generation-types";
import type { VideoConfigurationAction, VideoGenerationRunResult } from "@/lib/video-generation-types";
import type { VoiceConfigurationAction, VoiceGenerationInput, VoiceGenerationRunResult } from "@/lib/voice-generation-types";
import type { MusicConfigurationAction, MusicGenerationInput, MusicGenerationRunResult } from "@/lib/music-generation-types";
import type { RenderRunResult } from "@/lib/rendering-types";
import { syncEditingTimelineAudioSelections, validateEditingTimeline } from "@/lib/editing-timeline";
import { DashboardView } from "./shorts-dashboard-view";
import { Icon } from "./shorts-dashboard-shared";
import { ProjectCreateDialog, TemplateManager } from "./shorts-dashboard-templates";

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
export function ShortsDashboard({ configuredImageModel, configuredVideoModel, configuredVoiceModel, configuredMusicModel }: { configuredImageModel: string | null; configuredVideoModel: string | null; configuredVoiceModel: string | null; configuredMusicModel: string | null }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeRenderRunId, setActiveRenderRunId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const displayedProject = useMemo(() => {
    if (!project) return null;
    const synchronized = structuredClone(project);
    return syncEditingTimelineAudioSelections(synchronized) ? synchronized : project;
  }, [project]);

  useEffect(() => {
    if (!createDialogOpen && !templateManagerOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [createDialogOpen, templateManagerOpen]);

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

  const refreshFiles = async (projectId: string) => {
    const result = await requestJson<ProjectFilesResult>(`/api/projects/${projectId}/files`);
    setFiles(result.files);
  };

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      try {
        const [result, templateResult] = await Promise.all([
          requestJson<ProjectListResult>("/api/projects"),
          requestJson<TemplateListResult>("/api/templates"),
        ]);
        if (!active) return;
        setProjects(result.projects);
        setTemplates(templateResult.templates);
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

  const createNewProject = async (name: string, templateId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, templateId }),
      });
      const filesResponse = await requestJson<ProjectFilesResult>(
        `/api/projects/${result.project.project.id}/files`,
      );
      setProjects(result.projects);
      setProject(result.project);
      setFiles(filesResponse.files);
      setSearchQuery("");
      setCreateDialogOpen(false);
      setNotice(templateId ? "템플릿 설정을 적용한 새 프로젝트를 저장했습니다." : "새 프로젝트를 만들고 로컬 저장소에 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  const createCurrentTemplate = async (name: string) => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await requestJson<TemplateListResult>("/api/templates", { method: "POST", body: JSON.stringify({ name, project }) });
      setTemplates(result.templates);
      setNotice("현재 제작 설정을 템플릿으로 저장했습니다.");
    } catch (caught) { showError(caught); } finally { setBusy(false); }
  };

  const updateCurrentTemplate = async (template: ProjectTemplate, name: string) => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await requestJson<TemplateListResult>(`/api/templates/${template.id}`, { method: "PUT", body: JSON.stringify({ name, project }) });
      setTemplates(result.templates);
      setNotice("템플릿 이름과 제작 설정을 수정했습니다.");
    } catch (caught) { showError(caught); } finally { setBusy(false); }
  };

  const deleteSavedTemplate = async (template: ProjectTemplate) => {
    if (!window.confirm(`'${template.name}' 템플릿을 삭제할까요? 프로젝트는 삭제되지 않습니다.`)) return;
    setBusy(true);
    try {
      const result = await requestJson<TemplateListResult>(`/api/templates/${template.id}`, { method: "DELETE" });
      setTemplates(result.templates);
      setNotice("템플릿을 삭제했습니다.");
    } catch (caught) { showError(caught); } finally { setBusy(false); }
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
    const timelineErrors = validateEditingTimeline(
      project,
      new Set(files.filter((file) => file.status === "available").map((file) => file.id)),
    );
    if (timelineErrors.length > 0) {
      showError(`타임라인을 저장할 수 없습니다. ${timelineErrors.join(" ")}`);
      return;
    }
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

  const generateImages = async (sceneIds?: string[]) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice(sceneIds ? "선택한 장면 이미지를 fal.ai에 요청했습니다." : "모든 장면 이미지를 fal.ai에 요청했습니다.");
    try {
      const started = await requestJson<ImageGenerationRunResult>(`/api/projects/${project.project.id}/image-runs`, {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID(), ...(sceneIds ? { sceneIds } : {}) }),
      });
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 360 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<ImageGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/image-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      await refreshFiles(project.project.id);
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "이미지를 생성해 프로젝트에 저장했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "이미지 생성 결과를 확인해 주세요.");
      else setNotice("이미지 생성은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const updateImageConfiguration = async (action: ImageConfigurationAction) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(`/api/projects/${project.project.id}/image-configuration`, {
        method: "PATCH",
        body: JSON.stringify(action),
      });
      setProject(result.project);
      setProjects(result.projects);
      await refreshFiles(project.project.id);
      setNotice("이미지 검토와 영상 준비 설정을 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const generateVideoPrompts = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice("영상 대상으로 선택한 장면의 프롬프트를 OpenAI에 요청했습니다.");
    try {
      const started = await requestJson<ImageGenerationRunResult>(`/api/projects/${project.project.id}/video-prompt-runs`, {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 120 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<ImageGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/video-prompt-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "영상 프롬프트를 저장했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "영상 프롬프트 결과를 확인해 주세요.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const generateVideos = async (sceneIds?: string[]) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice(sceneIds ? "선택한 장면 영상을 fal.ai에 요청했습니다." : "영상 대상으로 지정한 장면들을 fal.ai에 요청했습니다.");
    try {
      const started = await requestJson<VideoGenerationRunResult>(`/api/projects/${project.project.id}/video-runs`, {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID(), ...(sceneIds ? { sceneIds } : {}) }),
      });
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 600 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<VideoGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/video-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      await refreshFiles(project.project.id);
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "영상을 생성해 프로젝트에 저장했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "영상 생성 결과를 확인해 주세요.");
      else setNotice("영상 생성은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const updateVideoConfiguration = async (action: VideoConfigurationAction) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(`/api/projects/${project.project.id}/video-configuration`, {
        method: "PATCH",
        body: JSON.stringify(action),
      });
      setProject(result.project);
      setProjects(result.projects);
      await refreshFiles(project.project.id);
      setNotice("대표 영상 후보를 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const generateVoice = async (input: VoiceGenerationInput) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice("전체 대본을 fal.ai 음성 모델에 요청했습니다.");
    try {
      const started = await requestJson<VoiceGenerationRunResult>(`/api/projects/${project.project.id}/voice-runs`, {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID(), input }),
      });
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 300 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<VoiceGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/voice-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      await refreshFiles(project.project.id);
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "전체 더빙을 생성해 프로젝트에 저장했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "더빙 생성 결과를 확인해 주세요.");
      else setNotice("더빙 생성은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const updateVoiceConfiguration = async (action: VoiceConfigurationAction) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(`/api/projects/${project.project.id}/voice-configuration`, {
        method: "PATCH",
        body: JSON.stringify(action),
      });
      setProject(result.project);
      setProjects(result.projects);
      await refreshFiles(project.project.id);
      setNotice("대표 더빙 후보를 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const generateMusic = async (input: MusicGenerationInput) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    setNotice(`${project.project.settings.targetDurationSeconds}초 배경음악을 fal.ai에 요청했습니다.`);
    try {
      const started = await requestJson<MusicGenerationRunResult>(`/api/projects/${project.project.id}/music-runs`, {
        method: "POST",
        body: JSON.stringify({ requestId: crypto.randomUUID(), input }),
      });
      setProject(started.project);
      let latest = started;
      for (let attempt = 0; attempt < 600 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<MusicGenerationRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/music-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      await refreshFiles(project.project.id);
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "배경음악을 생성해 프로젝트에 저장했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "배경음악 생성 결과를 확인해 주세요.");
      else setNotice("배경음악 생성은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const updateMusicConfiguration = async (action: MusicConfigurationAction) => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<ProjectMutationResult>(`/api/projects/${project.project.id}/music-configuration`, {
        method: "PATCH",
        body: JSON.stringify(action),
      });
      setProject(result.project);
      setProjects(result.projects);
      await refreshFiles(project.project.id);
      setNotice(action.action === "select-music" ? "대표 배경음악 후보를 저장했습니다." : "배경음악 설정을 저장했습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(false);
    }
  };

  const renderFinalVideo = async () => {
    if (!project) return;
    const timelineErrors = validateEditingTimeline(
      project,
      new Set(files.filter((file) => file.status === "available").map((file) => file.id)),
    );
    if (timelineErrors.length > 0) {
      showError(`렌더링 입력을 확인해 주세요. ${timelineErrors.join(" ")}`);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice("프로젝트를 저장하고 Python·FFmpeg 렌더링을 준비하고 있습니다.");
    try {
      const saved = await requestJson<ProjectMutationResult>(
        `/api/projects/${project.project.id}`,
        { method: "PUT", body: JSON.stringify({ action: "save", project }) },
      );
      setProject(saved.project);
      setProjects(saved.projects);
      const started = await requestJson<RenderRunResult & { created: boolean }>(
        `/api/projects/${project.project.id}/render-runs`,
        { method: "POST", body: JSON.stringify({ requestId: crypto.randomUUID() }) },
      );
      setProject(started.project);
      setActiveRenderRunId(started.runId);
      setNotice("격리된 작업 디렉터리에서 최종 MP4를 합성하고 있습니다.");
      let latest: RenderRunResult = started;
      for (let attempt = 0; attempt < 3600 && latest.status === "실행 중"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const status = await requestJson<RenderRunResult & { projects: ProjectSummary[] }>(
          `/api/projects/${project.project.id}/render-runs/${started.runId}`,
        );
        latest = status;
        setProject(status.project);
        setProjects(status.projects);
      }
      await refreshFiles(project.project.id);
      const run = latest.project.runs.find((candidate) => candidate.id === latest.runId);
      if (latest.status === "완료") setNotice(run?.message ?? "최종 MP4를 생성했습니다.");
      else if (latest.status === "취소됨") setNotice(run?.message ?? "렌더링을 취소했습니다.");
      else if (latest.status === "실패" || latest.status === "확인 필요") throw new Error(run?.errorSummary ?? run?.message ?? "렌더링 결과를 확인해 주세요.");
      else setNotice("렌더링은 서버에서 계속 진행 중입니다. 프로젝트를 다시 열어 상태를 확인할 수 있습니다.");
    } catch (caught) {
      showError(caught);
    } finally {
      setActiveRenderRunId(null);
      setBusy(false);
    }
  };

  const cancelFinalVideo = async (runId: string) => {
    if (!project) return;
    try {
      await requestJson<RenderRunResult>(`/api/projects/${project.project.id}/render-runs/${runId}`, { method: "DELETE" });
      setNotice("렌더링 취소를 요청했습니다. 프로세스 종료 상태를 확인하고 있습니다.");
    } catch (caught) {
      showError(caught);
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

  if (!project || !displayedProject)
    return <>
      <EmptyWorkspace loading={loading || busy} error={error} onCreate={() => setCreateDialogOpen(true)} />
      {createDialogOpen && <ProjectCreateDialog templates={templates} busy={busy} onClose={() => setCreateDialogOpen(false)} onCreate={(name, templateId) => void createNewProject(name, templateId)} />}
    </>;

  const persistedRenderRunId = [...project.runs].reverse().find(
    (run) => run.stageId === "editing" && run.status === "실행 중",
  )?.id ?? null;

  return (<>
    <DashboardView
      key={project.project.id}
      project={displayedProject}
      projects={projects}
      files={files}
      searchQuery={searchQuery}
      busy={busy}
      notice={notice}
      error={error}
      onSearchChange={setSearchQuery}
      onCreate={() => setCreateDialogOpen(true)}
      onTemplates={() => setTemplateManagerOpen(true)}
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
      onGenerateImages={(sceneIds) => void generateImages(sceneIds)}
      onImageConfiguration={(action) => void updateImageConfiguration(action)}
      onGenerateVideoPrompts={() => void generateVideoPrompts()}
      onGenerateVideos={(sceneIds) => void generateVideos(sceneIds)}
      onVideoConfiguration={(action) => void updateVideoConfiguration(action)}
      onGenerateVoice={(input) => void generateVoice(input)}
      onVoiceConfiguration={(action) => void updateVoiceConfiguration(action)}
      onGenerateMusic={(input) => void generateMusic(input)}
      onMusicConfiguration={(action) => void updateMusicConfiguration(action)}
      onRender={() => void renderFinalVideo()}
      onCancelRender={(runId) => void cancelFinalVideo(runId)}
      activeRenderRunId={activeRenderRunId ?? persistedRenderRunId}
      configuredImageModel={configuredImageModel}
      configuredVideoModel={configuredVideoModel}
      configuredVoiceModel={configuredVoiceModel}
      configuredMusicModel={configuredMusicModel}
    />
    {createDialogOpen && <ProjectCreateDialog templates={templates} busy={busy} onClose={() => setCreateDialogOpen(false)} onCreate={(name, templateId) => void createNewProject(name, templateId)} />}
    {templateManagerOpen && <TemplateManager templates={templates} busy={busy} onClose={() => setTemplateManagerOpen(false)} onCreate={(name) => void createCurrentTemplate(name)} onUpdate={(template, name) => void updateCurrentTemplate(template, name)} onDelete={(template) => void deleteSavedTemplate(template)} />}
  </>);
}
