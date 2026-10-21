"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ProjectDocument } from "@/lib/project-schema";
import type { ScriptGenerationInput } from "@/lib/script-generation-types";
import type { ImageConfigurationAction } from "@/lib/image-generation-types";
import type { VideoConfigurationAction } from "@/lib/video-generation-types";
import { Icon, StatusMark, fileIcon, formatFileSize, statusTextClass, stepIcons, type DashboardFile, type PanelContext, type WorkflowStep } from "./shorts-dashboard-shared";
import { PreviewVisual } from "./shorts-dashboard-preview";

export function SceneTable({
  project,
  files,
  onFileSelect,
  editable,
  imageEditable,
  videoEditable,
  busy,
  onSceneChange,
  onGenerateImages,
  onImageConfiguration,
  onGenerateVideos,
  onVideoConfiguration,
}: {
  project: ProjectDocument;
  files: readonly DashboardFile[];
  onFileSelect: (fileId: string) => void;
  editable: boolean;
  imageEditable: boolean;
  videoEditable: boolean;
  busy: boolean;
  onSceneChange: (
    sceneId: string,
    change: { narration?: string; visual?: string; imagePrompt?: string; durationSeconds?: number },
  ) => void;
  onGenerateImages: (sceneIds?: string[]) => void;
  onImageConfiguration: (action: ImageConfigurationAction) => void;
  onGenerateVideos: (sceneIds?: string[]) => void;
  onVideoConfiguration: (action: VideoConfigurationAction) => void;
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
              const imageCandidates = project.assets.filter((asset) => asset.sceneId === scene.id && asset.role === "scene-image");
              const videoCandidates = project.assets.filter((asset) => asset.sceneId === scene.id && asset.role === "scene-video");
              const videoFile = files.find((file) => file.id === scene.video.selectedAssetId);
              const allImageAssets = project.assets.filter((asset) => asset.role === "scene-image");
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
                    {imageEditable && <div className="mt-2 space-y-1.5">
                      <select aria-label={`${scene.order}번 장면 대표 이미지`} disabled={busy || imageCandidates.length === 0} value={scene.selectedImageAssetId ?? ""} onChange={(event) => onImageConfiguration({ action: "select-image", sceneId: scene.id, assetId: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold disabled:opacity-50">
                        <option value="">후보 없음</option>
                        {imageCandidates.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
                      </select>
                      <button type="button" disabled={busy} onClick={() => onGenerateImages([scene.id])} className="h-8 w-full rounded-lg border border-violet-200 text-[11px] font-bold text-violet-700 disabled:opacity-50">{imageCandidates.length ? "이 장면 재생성" : "이 장면 생성"}</button>
                    </div>}
                  </td>
                  <td className="px-2 py-2">
                    {imageEditable ? <div className="space-y-2 text-[11px]">
                      <label className="flex items-center gap-2 font-bold text-slate-700"><input type="checkbox" disabled={busy || !scene.selectedImageAssetId} checked={scene.video.enabled} onChange={(event) => onImageConfiguration({ action: "set-video-plan", sceneId: scene.id, enabled: event.target.checked, mode: event.target.checked ? "start_only" : null, startImageAssetId: event.target.checked ? scene.selectedImageAssetId : null, endImageAssetId: null })} />영상 생성</label>
                      {scene.video.enabled && <>
                        <select aria-label={`${scene.order}번 장면 영상 방식`} disabled={busy} value={scene.video.mode ?? "start_only"} onChange={(event) => { const mode = event.target.value as "start_only" | "start_end"; onImageConfiguration({ action: "set-video-plan", sceneId: scene.id, enabled: true, mode, startImageAssetId: scene.video.startImageAssetId ?? scene.selectedImageAssetId, endImageAssetId: mode === "start_end" ? (scene.video.endImageAssetId ?? scene.selectedImageAssetId) : null }); }} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-1">
                          <option value="start_only">시작 이미지 한 장</option><option value="start_end">시작·끝 이미지</option>
                        </select>
                        <select aria-label={`${scene.order}번 장면 시작 이미지`} disabled={busy} value={scene.video.startImageAssetId ?? ""} onChange={(event) => onImageConfiguration({ action: "set-video-plan", sceneId: scene.id, enabled: true, mode: scene.video.mode ?? "start_only", startImageAssetId: event.target.value, endImageAssetId: scene.video.mode === "start_end" ? scene.video.endImageAssetId : null })} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-1">
                          {allImageAssets.map((asset) => <option key={asset.id} value={asset.id}>시작 · {asset.label}</option>)}
                        </select>
                        {scene.video.mode === "start_end" && <select aria-label={`${scene.order}번 장면 끝 이미지`} disabled={busy} value={scene.video.endImageAssetId ?? ""} onChange={(event) => onImageConfiguration({ action: "set-video-plan", sceneId: scene.id, enabled: true, mode: "start_end", startImageAssetId: scene.video.startImageAssetId, endImageAssetId: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-1">
                          <option value="" disabled>끝 이미지 선택</option>{allImageAssets.map((asset) => <option key={asset.id} value={asset.id}>끝 · {asset.label}</option>)}
                        </select>}
                        <textarea key={typeof scene.video.input.prompt === "string" ? scene.video.input.prompt : ""} aria-label={`${scene.order}번 장면 영상 프롬프트`} defaultValue={typeof scene.video.input.prompt === "string" ? scene.video.input.prompt : ""} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== scene.video.input.prompt) onImageConfiguration({ action: "set-video-prompt", sceneId: scene.id, prompt: event.target.value }); }} placeholder="OpenAI 생성 후 수정" className="min-h-20 w-full resize-y rounded-lg border border-slate-200 p-2 leading-4" />
                      </>}
                    </div> : scene.video.enabled ? <div className="space-y-1"><span className="inline-flex rounded-full bg-violet-100 px-2 py-1 font-bold text-violet-700">영상 생성</span><p className="font-semibold text-slate-700">{scene.video.mode === "start_end" ? `${scene.order}번 → ${endScene ? Number(endScene.slice(-2)) : "?"}번 이미지` : `${scene.order}번 이미지 한 장`}</p></div> : <span className="text-slate-400">이미지 사용</span>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5"><StatusMark status={scene.video.status} compact /><span className={`font-bold ${statusTextClass(scene.video.status)}`}>{scene.video.status}</span></div>
                    {videoEditable && scene.video.enabled && <div className="mt-2 space-y-1.5">
                      <select aria-label={`${scene.order}번 장면 대표 영상`} disabled={busy || videoCandidates.length === 0} value={scene.video.selectedAssetId ?? ""} onChange={(event) => onVideoConfiguration({ action: "select-video", sceneId: scene.id, assetId: event.target.value })} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-1 text-[11px] font-semibold disabled:opacity-50">
                        <option value="">후보 없음</option>
                        {videoCandidates.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
                      </select>
                      <button type="button" disabled={!videoFile} onClick={() => videoFile && onFileSelect(videoFile.id)} className="h-8 w-full rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50">대표 영상 미리보기</button>
                    </div>}
                  </td>
                  <td className="wrap-break-word px-2 py-2 text-slate-500">
                    <span>{scene.video.error ?? scene.image.error ?? "없음"}</span>
                    {videoEditable && scene.video.enabled && <button type="button" disabled={busy || typeof scene.video.input.prompt !== "string" || !scene.video.input.prompt.trim()} onClick={() => onGenerateVideos([scene.id])} className="mt-2 h-8 w-full rounded-lg border border-violet-200 text-[11px] font-bold text-violet-700 disabled:opacity-50">{videoCandidates.length ? "이 장면 재생성" : "이 장면 생성"}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ImageStepPanel({ project, busy, configuredImageModel, onGenerateImages, onGenerateVideoPrompts }: { project: ProjectDocument; busy: boolean; configuredImageModel: string | null; onGenerateImages: (sceneIds?: string[]) => void; onGenerateVideoPrompts: () => void }) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "image");
  const completed = project.scenes.filter((scene) => scene.image.status === "완료").length;
  const selectedVideos = project.scenes.filter((scene) => scene.video.enabled).length;
  const model = typeof step?.settings.model === "string" ? step.settings.model : (configuredImageModel ?? "모델 미설정");
  return <div className="space-y-4">
    <div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 p-4 text-white">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-violet-200">fal.ai 이미지 생성</p><h3 className="mt-1 text-lg font-black">{step?.status ?? "대기"}</h3></div><StatusMark status={step?.status ?? "대기"} compact /></div>
      <p className="mt-3 break-all text-xs leading-5 text-violet-100">모델: {model}</p>
    </div>
    <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-400">이미지 완료</p><p className="mt-1 text-lg font-black text-slate-900">{completed}/{project.scenes.length}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-400">영상 대상</p><p className="mt-1 text-lg font-black text-slate-900">{selectedVideos}개</p></div></div>
    <button type="button" disabled={busy || project.scenes.length === 0} onClick={() => onGenerateImages()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Icon name="image" className="h-4 w-4" />{completed ? "모든 장면 후보 추가 생성" : "모든 장면 이미지 생성"}</button>
    <button type="button" disabled={busy || selectedVideos === 0} onClick={onGenerateVideoPrompts} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 text-sm font-bold text-violet-700 disabled:opacity-50"><Icon name="sparkles" className="h-4 w-4" />선택 장면 영상 프롬프트 생성</button>
    <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">장면 표에서 후보를 검토하고 대표 이미지를 선택한 뒤, 영상화할 장면과 시작·끝 이미지를 지정하세요. 선택 전에는 영상 정보가 생성되지 않습니다.</p>
  </div>;
}

export function VideoStepPanel({ project, selectedFile, busy, configuredVideoModel, onGenerateVideos }: { project: ProjectDocument; selectedFile: DashboardFile | undefined; busy: boolean; configuredVideoModel: string | null; onGenerateVideos: (sceneIds?: string[]) => void }) {
  const step = project.workflow.steps.find((candidate) => candidate.id === "video");
  const targets = project.scenes.filter((scene) => scene.video.enabled);
  const completed = targets.filter((scene) => scene.video.status === "완료").length;
  const ready = targets.length > 0 && targets.every((scene) => typeof scene.video.input.prompt === "string" && scene.video.input.prompt.trim() && scene.video.startImageAssetId && (scene.video.mode !== "start_end" || scene.video.endImageAssetId));
  const model = typeof step?.settings.model === "string" ? step.settings.model : (configuredVideoModel ?? "모델 미설정");
  const previewFile = selectedFile?.kind === "video" ? selectedFile : undefined;
  return <div className="space-y-4">
    <div className="rounded-2xl bg-linear-to-br from-violet-600 to-indigo-700 p-4 text-white">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-violet-200">fal.ai 영상 생성</p><h3 className="mt-1 text-lg font-black">{step?.status ?? "대기"}</h3></div><StatusMark status={step?.status ?? "대기"} compact /></div>
      <p className="mt-3 break-all text-xs leading-5 text-violet-100">모델: {model}</p>
      <p className="mt-1 text-xs leading-5 text-violet-100">오디오 생성: 꺼짐</p>
    </div>
    <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-400">영상 대상</p><p className="mt-1 text-lg font-black text-slate-900">{targets.length}개</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-400">완료</p><p className="mt-1 text-lg font-black text-slate-900">{completed}/{targets.length}</p></div></div>
    <button type="button" disabled={busy || !configuredVideoModel || !ready} onClick={() => onGenerateVideos()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Icon name="video" className="h-4 w-4" />{completed ? "선택 장면 후보 추가 생성" : "선택 장면 영상 생성"}</button>
    {!configuredVideoModel && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-700">.env.local에 FAL_VIDEO_MODEL을 설정해 주세요.</p>}
    {!ready && targets.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">이미지 단계에서 선택 장면의 시작·끝 이미지와 영상 프롬프트를 먼저 준비해 주세요.</p>}
    {previewFile && <div><p className="mb-2 text-xs font-bold text-slate-500">선택한 영상 미리보기</p><PreviewVisual key={previewFile.id} file={previewFile} project={project} /></div>}
    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">영상 대상으로 선택하지 않은 장면은 최종 편집에서 대표 이미지를 그대로 사용합니다.</p>
  </div>;
}

export function ScriptStepPanel({
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

export function DetailPanel({ project, selectedStep, selectedFile, context, busy, configuredImageModel, configuredVideoModel, onProjectChange, onGenerate, onApplyScript, onGenerateImages, onGenerateVideoPrompts, onGenerateVideos }: { project: ProjectDocument; selectedStep: WorkflowStep; selectedFile: DashboardFile | undefined; context: PanelContext; busy: boolean; configuredImageModel: string | null; configuredVideoModel: string | null; onProjectChange: (project: ProjectDocument) => void; onGenerate: (input: ScriptGenerationInput) => void; onApplyScript: (narrations: string[]) => void; onGenerateImages: (sceneIds?: string[]) => void; onGenerateVideoPrompts: () => void; onGenerateVideos: (sceneIds?: string[]) => void }) {
  return (
    <aside aria-labelledby="detail-heading" className="h-full min-w-0 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">{context === "file" ? "File preview" : context === "script" ? "Script" : "Step detail"}</p>
      <h2 id="detail-heading" className="mt-1 mb-4 truncate text-lg font-extrabold text-slate-950">{context === "file" ? "선택한 파일 미리보기" : context === "script" ? "대본·장면 구성" : "선택한 단계"}</h2>
      {context === "step" && selectedStep.id === "script" ? (
        <ScriptStepPanel project={project} busy={busy} onProjectChange={onProjectChange} onGenerate={onGenerate} onApplyScript={onApplyScript} />
      ) : context === "step" && selectedStep.id === "image" ? (
        <ImageStepPanel project={project} busy={busy} configuredImageModel={configuredImageModel} onGenerateImages={onGenerateImages} onGenerateVideoPrompts={onGenerateVideoPrompts} />
      ) : context === "step" && selectedStep.id === "video" ? (
        <VideoStepPanel project={project} selectedFile={selectedFile} busy={busy} configuredVideoModel={configuredVideoModel} onGenerateVideos={onGenerateVideos} />
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

