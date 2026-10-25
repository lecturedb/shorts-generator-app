"use client";

import { useState } from "react";
import type { ProjectTemplate } from "@/lib/template-types";
import { Icon } from "./shorts-dashboard-shared";

export function ProjectCreateDialog({
  templates,
  busy,
  onClose,
  onCreate,
}: {
  templates: readonly ProjectTemplate[];
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">
              New project
            </p>
            <h2
              id="create-project-title"
              className="mt-1 text-xl font-black text-slate-950"
            >
              새 프로젝트 만들기
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100"
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-slate-700">
            프로젝트 이름
            <input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="새 쇼츠 프로젝트"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal"
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            제작 설정 템플릿
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal"
            >
              <option value="">기본 설정</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            템플릿에서는 제작 설정과 단계 포함 여부만 적용됩니다. 기존 대본,
            장면, 미디어, 실행 이력과 API 키는 복사하지 않습니다.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onCreate(name, templateId || null)}
            className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            프로젝트 생성
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplateManager({
  templates,
  busy,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  templates: readonly ProjectTemplate[];
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  onUpdate: (template: ProjectTemplate, name: string) => void;
  onDelete: (template: ProjectTemplate) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-manager-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">
              Templates
            </p>
            <h2
              id="template-manager-title"
              className="mt-1 text-xl font-black text-slate-950"
            >
              템플릿 관리
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              현재 프로젝트의 단계별 설정과 포함 여부를 저장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100"
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-5 flex gap-2">
          <input
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="새 템플릿 이름"
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => {
              onCreate(name);
              setName("");
            }}
            className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            현재 설정 저장
          </button>
        </div>
        <div className="mt-5 space-y-3">
          {templates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              저장된 템플릿이 없습니다.
            </p>
          ) : (
            templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                busy={busy}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  busy,
  onUpdate,
  onDelete,
}: {
  template: ProjectTemplate;
  busy: boolean;
  onUpdate: (template: ProjectTemplate, name: string) => void;
  onDelete: (template: ProjectTemplate) => void;
}) {
  const [name, setName] = useState(template.name);
  const included = template.settings.workflow.filter(
    (step) => step.included,
  ).length;
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <input
            aria-label="템플릿 이름"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold"
          />
          <p className="mt-2 text-xs text-slate-500">
            포함 단계 {included}/6 · {template.settings.project.aspectRatio} ·{" "}
            {template.settings.project.width}×{template.settings.project.height}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onUpdate(template, name)}
            className="h-9 rounded-lg border border-violet-200 px-3 text-xs font-bold text-violet-700 disabled:opacity-50"
          >
            현재 설정으로 수정
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(template)}
            className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 disabled:opacity-50"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
