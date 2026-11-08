import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkflowDefinition, WorkflowRun } from "../../shared/workflow";
import { listenLiveFrames } from "@/lib/live-events";
import { isActiveStatus } from "@/lib/workflow-format";
import { listRuns, listWorkflows } from "@/lib/workflows-api";

const POLL_MS = 5_000;

export interface WorkflowFeed {
  workflows: WorkflowDefinition[];
  runs: WorkflowRun[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  refresh: () => void;
  mergeRun: (run: WorkflowRun) => void;
  removeRun: (runId: string) => void;
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function useWorkflowFeed(): WorkflowFeed {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const polling = useRef(false);
  const loadedOnce = useRef(false);
  const hasActive = runs.some((run) => isActiveStatus(run.status));

  const load = useCallback(async (background: boolean) => {
    const [nextWorkflows, nextRuns] = await Promise.all([
      listWorkflows({ background }),
      listRuns(200, { background }),
    ]);
    setWorkflows(nextWorkflows);
    setRuns(nextRuns);
    setError(null);
    setConnected(true);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!loadedOnce.current) setLoading(true);
    void load(false)
      .catch((cause) => { if (alive) setError(message(cause)); })
      .finally(() => {
        if (!alive) return;
        loadedOnce.current = true;
        setLoading(false);
      });
    return () => { alive = false; };
  }, [load, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const mergeRun = useCallback((run: WorkflowRun) => {
    setRuns((current) => {
      const index = current.findIndex((candidate) => candidate.id === run.id);
      if (index < 0) return [run, ...current];
      const next = current.slice();
      next[index] = run;
      return next;
    });
  }, []);

  const removeRun = useCallback((runId: string) => {
    setRuns((current) => current.filter((run) => run.id !== runId));
  }, []);

  useEffect(() => listenLiveFrames({
    onFrame: (frame) => {
      if (frame.kind === "workflow.run") mergeRun(frame.run);
    },
    onMissedFrames: () => refresh(),
  }), [mergeRun, refresh]);

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void load(true)
        .catch(() => setConnected(false))
        .finally(() => { polling.current = false; });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, load]);

  return { workflows, runs, loading, error, connected, refresh, mergeRun, removeRun };
}
