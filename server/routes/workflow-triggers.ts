// The read-only department view of Workflow webhook triggers. Admin-only by default (request-auth),
// and it never carries a credential, a constant or a payload: the Studio owns every mutation.
import type { WorkflowTriggerManager } from "../workflow-triggers.ts";
import { PASS, type RouteHandler } from "./table.ts";

export interface WorkflowTriggerRouteDeps {
  triggers: WorkflowTriggerManager;
}

export function createWorkflowTriggerRoutes({ triggers }: WorkflowTriggerRouteDeps): RouteHandler {
  return async ({ res, path, method, url, json }) => {
    if (path !== "/api/workflow-triggers") return PASS;
    if (method !== "GET") return void json(res, 405, { error: "method not allowed" });
    const department = url.searchParams.get("department")?.trim() || undefined;
    const raw = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isSafeInteger(raw) ? raw : 100;
    return void json(res, 200, { triggers: triggers.listDepartment(limit, department) });
  };
}
