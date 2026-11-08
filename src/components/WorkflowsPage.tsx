import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ListChecks, Play, Plus, Search, Workflow as WorkflowIcon, X } from "lucide-react";

import type { WorkflowDefinition, WorkflowRun } from "../../shared/workflow";
import { WorkflowConsolePage } from "@/components/WorkflowConsolePage";
import { WorkflowStudioPage } from "@/components/studio/WorkflowStudioPage";
import { WindowDragStrip } from "@/components/DesktopCapabilities";
import { useWorkflowFeed } from "@/hooks/useWorkflowFeed";
import { ApiError } from "@/state/api";
import { openThread, useStore } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useMediaQuery } from "@/lib/use-media-query";
import { useShowThreads } from "@/lib/thread-preferences";
import { isActiveStatus } from "@/lib/workflow-format";
import { cancelRun, deleteRun, deleteWorkflow, readWorkflow, startRun, type ActiveRunRef } from "@/lib/workflows-api";
import { ConfirmDialog } from "./workflows/ConfirmDialog";
import { DIALOG_BUTTON, Dialog } from "./workflows/Dialog";
import { FilterPopover, defaultRunFilters, defaultWorkflowFilters } from "./workflows/FilterPopover";
import { PanelMenu } from "./workflows/PanelMenu";
import { RunDetail } from "./workflows/RunDetail";
import { RunDialog } from "./workflows/RunDialog";
import { RunList } from "./workflows/RunList";
import { WorkflowDetail } from "./workflows/WorkflowDetail";
import { WorkflowList } from "./workflows/WorkflowList";
import type { DialogState, RunFilters, Tab, ToastMessage, WorkflowConflict, WorkflowFilters } from "./workflows/types";

const WIDTH_KEY = "mimir-workflows-width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 470;
const DEFAULT_WIDTH = 320;
const PAGE_SIZE = 30;

function readWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (stored >= MIN_WIDTH && stored <= MAX_WIDTH) return stored;
  } catch {
    // storage may be blocked
  }
  const narrow = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 1100px)").matches;
  return narrow ? 280 : DEFAULT_WIDTH;
}

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WorkflowsPage() {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const compact = useMediaQuery("(max-width: 900px)");
  const feed = useWorkflowFeed();

  const [tab, setTab] = useState<Tab>("workflows");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>();
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [selectedVersion, setSelectedVersion] = useState<number>();
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [workflowFilters, setWorkflowFilters] = useState<WorkflowFilters>(defaultWorkflowFilters);
  const [runFilters, setRunFilters] = useState<RunFilters>(defaultRunFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [studio, setStudio] = useState<{ id?: string } | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [width, setWidth] = useState(readWidth);
  const [visibleRuns, setVisibleRuns] = useState(PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());
  const [versionsById, setVersionsById] = useState<Record<string, WorkflowDefinition[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [conflict, setConflict] = useState<WorkflowConflict | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const page = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* storage may be blocked */ }
  }, [width]);

  useEffect(() => {
    setVisibleRuns(PAGE_SIZE);
  }, [search, runFilters, tab]);

  useEffect(() => {
    setDetailError(null);
  }, [selectedWorkflowId, selectedRunId, tab]);

  useEffect(() => {
    if (selectedStep === null || filterOpen || menuOpen || dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setSelectedStep(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedStep, filterOpen, menuOpen, dialog]);

  const showToast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2_400);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const activeRuns = useMemo(() => {
    const map = new Map<string, WorkflowRun>();
    for (const run of feed.runs) {
      if (isActiveStatus(run.status) && !map.has(run.workflowId)) map.set(run.workflowId, run);
    }
    return map;
  }, [feed.runs]);

  const activity = useMemo(() => {
    const map = new Map<string, number>();
    for (const workflow of feed.workflows) map.set(workflow.id, workflow.updatedAt);
    for (const run of feed.runs) map.set(run.workflowId, Math.max(map.get(run.workflowId) ?? 0, run.updatedAt));
    return map;
  }, [feed.workflows, feed.runs]);

  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    let list = feed.workflows;
    if (query) list = list.filter((workflow) => workflow.name.toLocaleLowerCase("pt-BR").includes(query));
    if (workflowFilters.department) list = list.filter((workflow) => workflow.department === workflowFilters.department);
    if (workflowFilters.situation !== "all") {
      list = list.filter((workflow) => workflowFilters.situation === "active" ? activeRuns.has(workflow.id) : !activeRuns.has(workflow.id));
    }
    return [...list].sort((left, right) => workflowFilters.sort === "name"
      ? left.name.localeCompare(right.name, "pt-BR")
      : (activity.get(right.id) ?? 0) - (activity.get(left.id) ?? 0));
  }, [feed.workflows, search, workflowFilters, activeRuns, activity]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = feed.runs;
    if (query) list = list.filter((run) => run.id.toLowerCase().includes(query));
    if (runFilters.workflowId) list = list.filter((run) => run.workflowId === runFilters.workflowId);
    if (runFilters.statuses.length > 0) list = list.filter((run) => runFilters.statuses.includes(run.status));
    if (runFilters.department) list = list.filter((run) => run.department === runFilters.department);
    if (runFilters.period !== "all") {
      const cutoff = runFilters.period === "today" ? startOfToday(now) : runFilters.period === "7" ? now - 7 * 86_400_000 : now - 30 * 86_400_000;
      list = list.filter((run) => run.createdAt >= cutoff);
    }
    return list;
  }, [feed.runs, search, runFilters, now]);

  const wantedKey = useMemo(() => {
    const ids = new Set<string>();
    if (tab === "workflows" && selectedWorkflowId) ids.add(selectedWorkflowId);
    if (tab === "runs") {
      const run = feed.runs.find((candidate) => candidate.id === selectedRunId);
      if (run) ids.add(run.workflowId);
    }
    return [...ids].join(",");
  }, [tab, selectedWorkflowId, selectedRunId, feed.runs]);

  useEffect(() => {
    let alive = true;
    const ids = wantedKey ? wantedKey.split(",") : [];
    const missing = ids.filter((id) => versionsById[id] === undefined);
    if (missing.length === 0) return;
    setDetailLoading(true);
    void Promise.all(missing.map((id) => readWorkflow(id)
      .then((detail) => { if (alive) setVersionsById((current) => ({ ...current, [id]: detail.versions })); })
      .catch((error: unknown) => {
        if (!alive) return;
        if (error instanceof ApiError && error.status === 404) setVersionsById((current) => ({ ...current, [id]: [] }));
        else setDetailError(errorText(error));
      })))
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [wantedKey, versionsById]);

  useEffect(() => {
    if (compact) return;
    if (tab === "workflows" && !selectedWorkflowId && feed.workflows[0]) setSelectedWorkflowId(feed.workflows[0].id);
    if (tab === "runs" && !selectedRunId && feed.runs[0]) setSelectedRunId(feed.runs[0].id);
  }, [compact, tab, feed.workflows, feed.runs, selectedWorkflowId, selectedRunId]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setSearch("");
    setSelectedStep(null);
    setFilterOpen(false);
  };

  const selectWorkflow = (id: string) => {
    setSelectedWorkflowId(id);
    setSelectedVersion(undefined);
    setSelectedStep(null);
    setMobileDetail(true);
  };

  const selectRun = (id: string) => {
    setSelectedRunId(id);
    setSelectedStep(null);
    setMobileDetail(true);
  };

  const botName = (botId: string) => state.bots.find((bot) => bot.id === botId)?.name ?? t("workflows.bot.unknown");

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setConflict(null);
    setCancelReason("");
  };

  const confirmStart = async (version: number) => {
    if (dialog?.kind !== "run") return;
    setBusy(true);
    try {
      const run = await startRun(dialog.workflowId, version);
      feed.mergeRun(run);
      feed.refresh();
      setDialog(null);
      setTab("runs");
      setSelectedRunId(run.id);
      setMobileDetail(true);
      showToast(t("workflows.dialog.startedToast"));
    } catch (error) {
      showToast(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (dialog?.kind !== "cancel") return;
    setBusy(true);
    try {
      const run = await cancelRun(dialog.runId, cancelReason);
      feed.mergeRun(run);
      setDialog(null);
      setCancelReason("");
      showToast(t("workflows.run.cancelledToast"));
    } catch (error) {
      showToast(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteWorkflow = async () => {
    if (dialog?.kind !== "deleteWorkflow") return;
    const id = dialog.workflowId;
    setBusy(true);
    try {
      await deleteWorkflow(id);
      setVersionsById((current) => { const next = { ...current }; delete next[id]; return next; });
      setSelectedWorkflowId(undefined);
      setSelectedStep(null);
      setDialog(null);
      setConflict(null);
      feed.refresh();
      showToast(t("workflows.dialog.deletedWorkflowToast"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict({
          message: error.message,
          runs: Array.isArray(error.body?.runs) ? error.body.runs as ActiveRunRef[] : [],
        });
      } else {
        showToast(errorText(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteRun = async () => {
    if (dialog?.kind !== "deleteRun") return;
    const id = dialog.runId;
    setBusy(true);
    try {
      await deleteRun(id);
      feed.removeRun(id);
      setSelectedRunId(undefined);
      setDialog(null);
      showToast(t("workflows.run.deletedToast"));
    } catch (error) {
      showToast(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const openConversation = (botId: string, threadId: string) => {
    openThread(dispatch, { botId, threadId }, state, showThreads);
  };

  const versionsFor = (id: string, latest?: WorkflowDefinition): WorkflowDefinition[] => {
    const cached = versionsById[id];
    if (cached && cached.length > 0) return cached;
    return latest ? [latest] : [];
  };

  const chips = useMemo(() => {
    const list: Array<{ key: string; label: string; clear: () => void }> = [];
    if (tab === "workflows") {
      if (workflowFilters.department) list.push({ key: "department", label: t("workflows.filters.activeDepartment", { name: workflowFilters.department }), clear: () => setWorkflowFilters((current) => ({ ...current, department: "" })) });
      if (workflowFilters.situation !== "all") list.push({
        key: "situation",
        label: workflowFilters.situation === "active" ? t("workflows.filters.withActiveRun") : t("workflows.filters.withoutActiveRun"),
        clear: () => setWorkflowFilters((current) => ({ ...current, situation: "all" })),
      });
      if (workflowFilters.sort !== "name") list.push({
        key: "sort",
        label: t("workflows.filters.activeSort", { name: t("workflows.filters.sortActivity") }),
        clear: () => setWorkflowFilters((current) => ({ ...current, sort: "name" })),
      });
    } else {
      if (runFilters.workflowId) {
        const workflow = feed.workflows.find((candidate) => candidate.id === runFilters.workflowId);
        list.push({ key: "workflow", label: t("workflows.filters.activeWorkflow", { name: workflow?.name ?? runFilters.workflowId }), clear: () => setRunFilters((current) => ({ ...current, workflowId: "" })) });
      }
      if (runFilters.statuses.length > 0) list.push({
        key: "statuses",
        label: runFilters.statuses.length === 1 ? t("workflows.filters.activeStatusOne") : t("workflows.filters.activeStatuses", { count: runFilters.statuses.length }),
        clear: () => setRunFilters((current) => ({ ...current, statuses: [] })),
      });
      if (runFilters.department) list.push({ key: "department", label: t("workflows.filters.activeDepartment", { name: runFilters.department }), clear: () => setRunFilters((current) => ({ ...current, department: "" })) });
      if (runFilters.period !== "all") list.push({
        key: "period",
        label: runFilters.period === "today" ? t("workflows.filters.periodToday") : runFilters.period === "7" ? t("workflows.filters.period7") : t("workflows.filters.period30"),
        clear: () => setRunFilters((current) => ({ ...current, period: "all" })),
      });
    }
    return list;
  }, [tab, workflowFilters, runFilters, feed.workflows]);

  const shownWorkflows = tab === "workflows" ? filteredWorkflows : [];
  const shownRuns = filteredRuns.slice(0, visibleRuns);
  const total = tab === "workflows" ? filteredWorkflows.length : filteredRuns.length;
  const count = tab === "workflows"
    ? (total === 1 ? t("workflows.count.one") : t("workflows.count.other", { count: total }))
    : (total === 1 ? t("workflows.runs.countOne") : t("workflows.runs.countOther", { count: total }));

  const selectedWorkflow = selectedWorkflowId ? feed.workflows.find((workflow) => workflow.id === selectedWorkflowId) : undefined;
  const selectedRun = selectedRunId ? feed.runs.find((run) => run.id === selectedRunId) : undefined;
  const selectedRunWorkflow = selectedRun
    ? feed.workflows.find((workflow) => workflow.id === selectedRun.workflowId)
    : undefined;

  const renderDetail = () => {
    if (detailError) {
      return (
        <div className="grid h-full place-items-center p-6 text-center">
          <div className="max-w-[360px]">
            <p className="text-[12px] leading-relaxed text-danger">{detailError}</p>
            <button type="button" onClick={() => { setDetailError(null); setVersionsById((current) => { const next = { ...current }; for (const id of wantedKey.split(",")) delete next[id]; return next; }); }} className="mt-3 rounded-lg border border-hairline px-3 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-raised/60">
              {t("workflows.error.retry")}
            </button>
          </div>
        </div>
      );
    }

    if (tab === "workflows") {
      if (!selectedWorkflow) {
        if (selectedWorkflowId && !feed.loading) return <NotFound onBack={() => setSelectedWorkflowId(undefined)} />;
        return <EmptyDetail />;
      }
      const versions = versionsFor(selectedWorkflow.id, selectedWorkflow);
      const version = selectedVersion ?? selectedWorkflow.version;
      const shown = versions.find((candidate) => candidate.version === version) ?? selectedWorkflow;
      return (
        <WorkflowDetail
          workflow={shown}
          latest={selectedWorkflow}
          versions={versions}
          selectedVersion={shown.version}
          activeRun={activeRuns.get(selectedWorkflow.id)}
          selectedStep={selectedStep}
          botName={botName}
          loading={detailLoading}
          onVersion={(next) => setSelectedVersion(next)}
          onRun={(next) => { setConflict(null); setDialog({ kind: "run", workflowId: selectedWorkflow.id, version: next }); }}
          onEdit={() => setStudio({ id: selectedWorkflow.id })}
          onDelete={() => { setConflict(null); setDialog({ kind: "deleteWorkflow", workflowId: selectedWorkflow.id }); }}
          onSelectStep={(index) => setSelectedStep(index)}
          onCloseStep={() => setSelectedStep(null)}
          onBack={() => setMobileDetail(false)}
        />
      );
    }

    if (!selectedRun) {
      if (selectedRunId && !feed.loading) return <NotFound onBack={() => setSelectedRunId(undefined)} />;
      return <EmptyDetail />;
    }
    const versions = versionsFor(selectedRun.workflowId, selectedRunWorkflow);
    const definition = versions.find((candidate) => candidate.version === selectedRun.workflowVersion)
      ?? (selectedRunWorkflow?.version === selectedRun.workflowVersion ? selectedRunWorkflow : undefined);
    return (
      <RunDetail
        run={selectedRun}
        workflow={definition}
        now={now}
        botName={botName}
        onCancel={() => { setCancelReason(""); setDialog({ kind: "cancel", runId: selectedRun.id }); }}
        onDelete={() => setDialog({ kind: "deleteRun", runId: selectedRun.id })}
        onRerun={() => { setConflict(null); setDialog({ kind: "run", workflowId: selectedRun.workflowId, version: selectedRun.workflowVersion }); }}
        onOpenConversation={openConversation}
        onBack={() => setMobileDetail(false)}
      />
    );
  };

  if (studio) {
    const department = (studio.id ? feed.workflows.find((workflow) => workflow.id === studio.id)?.department : undefined)
      ?? selectedWorkflow?.department
      ?? state.bots[0]?.section
      ?? "General";
    return (
      <WorkflowStudioPage
        workflowId={studio.id}
        department={department}
        onBack={() => setStudio(null)}
        onSaved={(id) => {
          setStudio(null);
          setTab("workflows");
          setSelectedWorkflowId(id);
          feed.refresh();
        }}
      />
    );
  }

  if (consoleOpen) {
    return <WorkflowConsolePage onBack={() => setConsoleOpen(false)} />;
  }

  const dialogWorkflow = dialog && (dialog.kind === "run" || dialog.kind === "deleteWorkflow")
    ? feed.workflows.find((workflow) => workflow.id === dialog.workflowId)
    : undefined;
  const dialogRun = dialog && (dialog.kind === "cancel" || dialog.kind === "deleteRun")
    ? feed.runs.find((run) => run.id === dialog.runId)
    : undefined;

  const showList = !compact || !mobileDetail;
  const showDetail = !compact || mobileDetail;

  return (
    <div ref={page} className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-app">
      <WindowDragStrip />

      <aside
        className={cn("flex min-h-0 shrink-0 flex-col border-r border-hairline/60 bg-panel", !showList && "hidden")}
        style={compact ? { width: "100%" } : { width }}
      >
        <div className="shrink-0 px-4 pt-5">
          <div className="flex items-center gap-2 px-1 pb-5">
            <span className="flex items-center gap-2 text-[14px] font-[650] tracking-[-0.25px] text-ink">
              <ListChecks size={16} className="text-ink-secondary" aria-hidden="true" />
              {t("workflows.title")}
            </span>
            <span className="ml-auto flex items-center gap-1.5 rounded-md bg-[#EAF5ED] px-1.5 py-1 text-[9.5px] font-medium text-[#4F7A61]">
              <span aria-hidden="true" className="size-[5px] rounded-full bg-[#45AC76]" />
              {t("workflows.live")}
            </span>
            <button
              type="button"
              aria-label={t("workflows.new")}
              title={t("workflows.new")}
              onClick={() => setStudio({})}
              className="grid size-6 place-items-center rounded-md border border-hairline text-ink-secondary hover:bg-raised/60 hover:text-ink"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
            <PanelMenu open={menuOpen} onOpenChange={setMenuOpen} onOpenConsole={() => setConsoleOpen(true)} />
          </div>

          <div className="-mx-4 grid grid-cols-2 border-b border-hairline">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "workflows"}
              onClick={() => changeTab("workflows")}
              className={cn(
                "relative flex items-center justify-center gap-1.5 px-3 py-3 text-[12px] font-medium",
                tab === "workflows" ? "text-ink after:absolute after:-bottom-px after:left-[13px] after:right-[13px] after:h-0.5 after:rounded after:bg-ink" : "text-ink-tertiary hover:text-ink",
              )}
            >
              {t("workflows.tab.workflows")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "runs"}
              onClick={() => changeTab("runs")}
              className={cn(
                "relative flex items-center justify-center gap-1.5 px-3 py-3 text-[12px] font-medium",
                tab === "runs" ? "text-ink after:absolute after:-bottom-px after:left-[13px] after:right-[13px] after:h-0.5 after:rounded after:bg-ink" : "text-ink-tertiary hover:text-ink",
              )}
            >
              <Play size={12} aria-hidden="true" className="opacity-70" />
              {t("workflows.tab.runs")}
              {feed.runs.length > 0 && <span className="rounded-full bg-raised px-1.5 text-[10px] font-medium text-ink-tertiary">{feed.runs.length}</span>}
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-hairline/40 px-[15px] pb-3 pt-[15px]">
          <div className="flex h-9 items-center gap-2 rounded-[10px] border border-hairline bg-app px-2.5 transition-[border-color,box-shadow] focus-within:border-accent-border focus-within:ring-2 focus-within:ring-accent/15">
            <Search size={13} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "workflows" ? t("workflows.search.workflows") : t("workflows.search.runs")}
              aria-label={tab === "workflows" ? t("workflows.search.workflows") : t("workflows.search.runs")}
              className="min-w-0 flex-1 bg-transparent text-[11.5px] text-ink outline-none placeholder:text-ink-tertiary"
            />
            {search && (
              <button type="button" aria-label={t("workflows.search.clear")} onClick={() => setSearch("")} className="grid size-4 place-items-center rounded text-ink-tertiary hover:text-ink">
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="mt-[11px] flex items-center justify-between gap-2">
            <FilterPopover
              tab={tab}
              open={filterOpen}
              onOpenChange={setFilterOpen}
              workflows={feed.workflows}
              filters={tab === "workflows" ? workflowFilters : runFilters}
              onApply={(next) => { if (tab === "workflows") setWorkflowFilters(next as WorkflowFilters); else setRunFilters(next as RunFilters); }}
            />
            <span className="text-[10.5px] text-ink-tertiary">{count}</span>
          </div>

          {chips.length > 0 && (
            <div className="mt-[11px] flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip.key} className="flex items-center gap-1 rounded-md border border-hairline bg-raised/40 py-1 pl-2 pr-1 text-[10px] text-ink-secondary">
                  {chip.label}
                  <button type="button" aria-label={t("workflows.filters.remove", { name: chip.label })} onClick={chip.clear} className="grid size-3.5 place-items-center rounded text-ink-tertiary hover:text-ink">
                    <X size={10} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="wf-thin-scroll min-h-0 flex-1 overflow-auto px-2 pb-3.5 pt-1.5">
          {feed.loading ? (
            <div className="px-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className={cn("wf-skeleton mb-0.5 rounded-[9px]", tab === "workflows" ? "h-[63px]" : "h-[68px]")} />
              ))}
            </div>
          ) : feed.error && feed.workflows.length === 0 && feed.runs.length === 0 ? (
            <div className="mx-1 mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              <p>{t("workflows.error.list")}</p>
              <p className="mt-0.5 text-[10px] opacity-80">{feed.error}</p>
              <button type="button" onClick={feed.refresh} className="mt-1.5 rounded-md border border-danger/40 px-2 py-1 text-[10.5px] font-medium hover:bg-danger/10">{t("workflows.error.retry")}</button>
            </div>
          ) : (
            <>
              {feed.error && (
                <div className="mx-1 mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[10.5px] text-danger">
                  <span className="truncate">{t("workflows.error.list")}</span>
                  <button type="button" onClick={feed.refresh} className="shrink-0 font-medium hover:underline">{t("workflows.error.retry")}</button>
                </div>
              )}
              <div role="listbox" aria-label={tab === "workflows" ? t("workflows.tab.workflows") : t("workflows.tab.runs")}>
                {tab === "workflows" ? (
                  shownWorkflows.length === 0 ? (
                    <ListEmpty
                      icon={<ListChecks size={22} aria-hidden="true" />}
                      title={t("workflows.empty.workflowsTitle")}
                      help={t("workflows.empty.workflowsHelp")}
                    />
                  ) : (
                    <WorkflowList
                      workflows={shownWorkflows}
                      runs={feed.runs}
                      selectedId={selectedWorkflowId}
                      now={now}
                      onSelect={selectWorkflow}
                      onRun={(id) => { setConflict(null); setDialog({ kind: "run", workflowId: id }); }}
                      onOpen={selectWorkflow}
                    />
                  )
                ) : shownRuns.length === 0 ? (
                  <ListEmpty
                    icon={<WorkflowIcon size={22} aria-hidden="true" />}
                    title={t("workflows.empty.runsTitle")}
                    help={t("workflows.empty.runsHelp")}
                  />
                ) : (
                  <>
                    <RunList runs={shownRuns} workflows={feed.workflows} selectedId={selectedRunId} now={now} onSelect={selectRun} />
                    {filteredRuns.length > visibleRuns && (
                      <button type="button" onClick={() => setVisibleRuns((value) => value + PAGE_SIZE)} className="mt-2 w-full rounded-lg border border-hairline bg-app py-2 text-[10.5px] font-medium text-ink-secondary hover:bg-raised/60">
                        {t("workflows.loadMore")}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {!compact && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("workflows.resize")}
          onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            const left = page.current?.getBoundingClientRect().left ?? 0;
            setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, event.clientX - left)));
          }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
          className="group relative z-10 -ml-[3px] w-[5px] shrink-0 cursor-col-resize after:absolute after:bottom-0 after:left-[2px] after:top-0 after:hidden after:w-[2px] after:bg-accent/40 group-hover:after:block"
        />
      )}

      <section className={cn("wf-thin-scroll relative min-h-0 min-w-0 flex-1 overflow-auto bg-app", !showDetail && "hidden")}>
        {renderDetail()}
      </section>

      {dialog?.kind === "run" && dialogWorkflow && (
        <RunDialog
          workflow={dialogWorkflow}
          versions={versionsFor(dialogWorkflow.id, dialogWorkflow)}
          initialVersion={dialog.version}
          busy={busy}
          onClose={closeDialog}
          onConfirm={(version) => void confirmStart(version)}
        />
      )}

      {dialog?.kind === "cancel" && dialogRun && (
        <ConfirmDialog
          title={t("workflows.run.cancelTitle")}
          message={t("workflows.run.cancelHelp")}
          confirmLabel={t("workflows.run.cancelConfirm")}
          busyLabel={t("workflows.run.cancelling")}
          busy={busy}
          onClose={closeDialog}
          onConfirm={() => void confirmCancel()}
        >
          <label className="mt-3 block">
            <span className="mb-1.5 block text-[11px] font-semibold text-ink-secondary">{t("workflows.run.cancelReason")}</span>
            <input
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={t("workflows.run.cancelReasonPlaceholder")}
              className="h-[37px] w-full rounded-[9px] border border-hairline bg-app px-2.5 text-[12px] text-ink outline-none focus:border-accent"
            />
          </label>
        </ConfirmDialog>
      )}

      {dialog?.kind === "deleteRun" && dialogRun && (
        <ConfirmDialog
          title={t("workflows.run.deleteTitle")}
          message={t("workflows.run.deleteHelp")}
          confirmLabel={t("workflows.run.deleteConfirm")}
          busyLabel={t("workflows.run.deleting")}
          busy={busy}
          onClose={closeDialog}
          onConfirm={() => void confirmDeleteRun()}
        />
      )}

      {dialog?.kind === "deleteWorkflow" && dialogWorkflow && (
        conflict ? (
          <Dialog
            title={t("workflows.dialog.deleteWorkflowTitle", { name: dialogWorkflow.name })}
            onClose={closeDialog}
            actions={<button type="button" className={DIALOG_BUTTON} onClick={closeDialog}>{t("workflows.dialog.back")}</button>}
          >
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-[11px] text-danger">{conflict.message}</div>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              {conflict.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => { closeDialog(); setTab("runs"); setSelectedRunId(run.id); setMobileDetail(true); }}
                  className="font-mono text-[10.5px] text-accent-text hover:underline"
                >
                  {run.id} · {t("workflows.dialog.openRun")}
                </button>
              ))}
            </div>
          </Dialog>
        ) : (
          <ConfirmDialog
            title={t("workflows.dialog.deleteWorkflowTitle", { name: dialogWorkflow.name })}
            message={t("workflows.dialog.deleteWorkflowHelp")}
            confirmLabel={t("workflows.dialog.deleteWorkflowConfirm")}
            busyLabel={t("workflows.dialog.deleting")}
            busy={busy}
            onClose={closeDialog}
            onConfirm={() => void confirmDeleteWorkflow()}
          />
        )
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-[26px] z-[150] flex items-center gap-2 rounded-[10px] bg-[#26272C] px-3.5 py-3 text-[11.5px] text-white shadow-xl">
          <Check size={13} className="text-[#83CDA2]" aria-hidden="true" />
          {toast.text}
        </div>
      )}
    </div>
  );
}

function ListEmpty({ icon, title, help }: { icon: ReactNode; title: string; help: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center px-4 text-center">
      <div>
        <div className="mx-auto mb-2.5 grid size-10 place-items-center rounded-xl bg-raised/50 text-ink-tertiary">{icon}</div>
        <strong className="block text-[12px] font-semibold text-ink-secondary">{title}</strong>
        <span className="mt-1 block text-[10.5px] leading-relaxed text-ink-tertiary">{help}</span>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-ink-tertiary">
      <div className="mb-1 grid size-[62px] place-items-center rounded-[18px] bg-raised/50">
        <ListChecks size={27} aria-hidden="true" />
      </div>
      <strong className="text-[14px] font-semibold text-ink-secondary">{t("workflows.empty.detailTitle")}</strong>
      <span className="max-w-[350px] text-[11px] leading-relaxed">{t("workflows.empty.detailHelp")}</span>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-ink-tertiary">
      <div className="mb-1 grid size-[62px] place-items-center rounded-[18px] bg-raised/50">
        <X size={27} aria-hidden="true" />
      </div>
      <strong className="text-[14px] font-semibold text-ink-secondary">{t("workflows.error.notFound")}</strong>
      <button type="button" onClick={onBack} className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-raised/60">
        {t("workflows.detail.backToList")}
      </button>
    </div>
  );
}
