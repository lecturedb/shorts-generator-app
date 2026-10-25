"use client";

import { useMemo, useState } from "react";
import type { ProjectFileEntry, ProjectFileKind } from "@/lib/project-file-types";
import type { ProjectSummary } from "@/lib/project-management-types";
import type { ProjectDocument } from "@/lib/project-schema";
import { DashboardView } from "./shorts-dashboard-view";

const demoMessage =
  "GitHub Pages 데모입니다. 화면 탐색과 로컬 편집은 가능하지만 생성·저장·렌더링은 로컬 서버에서 실행해야 합니다.";

function fileKind(kind: ProjectDocument["assets"][number]["kind"]): ProjectFileKind {
  return kind === "image" || kind === "video" || kind === "audio"
    ? kind
    : "unsupported";
}

export function GitHubPagesDashboard({
  initialProject,
}: {
  initialProject: ProjectDocument;
}) {
  const [project, setProject] = useState(initialProject);
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(demoMessage);
  const files = useMemo<ProjectFileEntry[]>(
    () =>
      project.assets.map((asset) => ({
        id: asset.id,
        label: asset.label,
        relativePath: asset.relativePath,
        stageId: asset.stageId,
        kind: fileKind(asset.kind),
        status: "available",
        format:
          typeof asset.metadata.format === "string"
            ? asset.metadata.format
            : asset.kind.toUpperCase(),
        createdAt: asset.createdAt,
        width: asset.metadata.width,
        height: asset.metadata.height,
        durationSeconds: asset.metadata.durationSeconds,
        selected: asset.selected,
        stale: asset.stale.isStale,
      })),
    [project.assets],
  );
  const projects = useMemo<ProjectSummary[]>(
    () => [
      {
        id: project.project.id,
        name: project.project.name,
        description: project.project.description,
        createdAt: project.project.createdAt,
        updatedAt: project.project.updatedAt,
        status: project.project.status,
      },
    ],
    [project.project],
  );
  const explainDemo = () => setNotice(demoMessage);

  return (
    <DashboardView
      project={project}
      projects={projects}
      files={files}
      searchQuery={searchQuery}
      busy={false}
      notice={notice}
      error={null}
      onSearchChange={setSearchQuery}
      onCreate={explainDemo}
      onTemplates={explainDemo}
      onProjectSelect={() => undefined}
      onRename={explainDemo}
      onSave={explainDemo}
      onDelete={explainDemo}
      onDismissMessage={() => setNotice(null)}
      onProjectChange={setProject}
      onGenerateScript={explainDemo}
      onGenerateImages={explainDemo}
      onImageConfiguration={explainDemo}
      onGenerateVideoPrompts={explainDemo}
      onGenerateVideos={explainDemo}
      onVideoConfiguration={explainDemo}
      onGenerateVoice={explainDemo}
      onVoiceConfiguration={explainDemo}
      onGenerateMusic={explainDemo}
      onMusicConfiguration={explainDemo}
      onRender={explainDemo}
      onCancelRender={explainDemo}
      activeRenderRunId={null}
      configuredImageModel="fal-ai/flux-2/flash"
      configuredVideoModel="fal-ai/kling-video/v3/standard/image-to-video"
      configuredVoiceModel="fal-ai/elevenlabs/tts/multilingual-v2"
      configuredMusicModel="fal-ai/stable-audio-25/text-to-audio"
    />
  );
}
