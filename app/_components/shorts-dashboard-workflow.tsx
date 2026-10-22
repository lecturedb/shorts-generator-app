"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ProjectDocument } from "@/lib/project-schema";
import { WorkflowCards } from "./shorts-dashboard-workflow-cards";
import { allowedWorkflowTargets, createInitialWorkflowConnections, createInitialWorkflowPositions, workflowColumnCount, workflowMetrics, type WorkflowConnection, type WorkflowPosition, type WorkflowSize, type WorkflowStep } from "./shorts-dashboard-shared";
export function WorkflowEditor({
  project,
  projectId,
  steps,
  selectedStepId,
  onStepSelect,
  configuredImageModel,
  configuredVideoModel,
  configuredVoiceModel,
  configuredMusicModel,
}: {
  project: ProjectDocument;
  projectId: string;
  steps: readonly WorkflowStep[];
  selectedStepId: string | null;
  onStepSelect: (stepId: string) => void;
  configuredImageModel: string | null;
  configuredVideoModel: string | null;
  configuredVoiceModel: string | null;
  configuredMusicModel: string | null;
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

          <WorkflowCards
            project={project}
            configuredImageModel={configuredImageModel}
            configuredVideoModel={configuredVideoModel}
            configuredVoiceModel={configuredVoiceModel}
            configuredMusicModel={configuredMusicModel}
            steps={steps}
            positions={positions}
            selectedStepId={selectedStepId}
            metrics={metrics}
            workflowSize={workflowSize}
            connectionDrag={connectionDrag}
            onStepSelect={onStepSelect}
            onCardDragStart={startCardDrag}
            onCardDragMove={moveCard}
            onCardDragEnd={finishCardDrag}
            onConnectionFinish={finishConnection}
            onConnectionStart={startConnection}
          />
        </div>
      </div>
    </div>
  );
}

