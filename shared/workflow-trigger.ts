/** Where one Workflow start parameter comes from when a webhook delivery arrives.
 * The value is used as it is: no coercion, no template, no evaluation. */
export type WorkflowInputBinding =
  | { source: "payload"; pointer: string; onMissing?: "reject" | "omit" }
  | { source: "header"; name: string; onMissing?: "reject" | "omit" }
  | { source: "query"; name: string; onMissing?: "reject" | "omit" }
  | { source: "constant"; value: string | number | boolean | Array<string | number | boolean> }
  | null;

/** The runtime of a webhook trigger. The secret itself is never part of this record. */
export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  workflowVersion: number;
  workflowName: string;
  department: string;
  name: string;
  endpointId: string;
  /** The Studio node this trigger belongs to, so linking never rewrites the definition. */
  nodeId?: string;
  inputs: Record<string, WorkflowInputBinding>;
  eventTypes?: string[];
  enabled: boolean;
  maxPendingRuns?: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: { person?: string; botId?: string };
  lastReceivedAt?: number;
  lastRunId?: string;
  deliveryCount: number;
  credentialResetAt?: number;
  pausedReason?: "missing-bot" | "missing-workflow" | "restored" | "frozen" | "moved";
}

export interface WorkflowTriggerInput {
  name: string;
  workflowVersion?: number;
  inputs: Record<string, WorkflowInputBinding>;
  eventTypes?: string[];
  enabled?: boolean;
  maxPendingRuns?: number | null;
  nodeId?: string;
}

export type WorkflowTriggerPatch = Partial<WorkflowTriggerInput>;

/** What the same resolver and validation would produce for a sample request; nothing is stored. */
export interface WorkflowTriggerPreview {
  workflowVersion: number;
  resolvedInputs: Record<string, unknown>;
  omitted: string[];
}

/** A minted credential. It is shown once; only its hash is written. */
export interface WorkflowTriggerCredential {
  secret: string;
  url: string;
}

export interface WorkflowTriggerCreateResult {
  trigger: WorkflowTrigger;
  credential: WorkflowTriggerCredential;
}

export type WorkflowTriggerAttemptOutcome = "accepted" | "duplicate" | "ignored" | "rejected";

/** Delivery metadata only: never the payload, the resolved inputs or a header value. */
export interface WorkflowTriggerAttempt {
  id: string;
  triggerId: string;
  receivedAt: number;
  outcome: WorkflowTriggerAttemptOutcome;
  statusCode: number;
  deliveryId?: string;
  eventName?: string;
  runId?: string;
  reason?: string;
}

/** What a delivery answered after admission. `ignored` and `duplicate` never create a run. */
export interface WorkflowTriggerDeliveryResult {
  accepted: true;
  deliveryId: string;
  runId?: string;
  duplicate: boolean;
  ignored?: boolean;
}
