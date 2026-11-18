import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import {
  isBotStep,
  workflowAllSteps,
  type WorkflowDefinition,
  type WorkflowParameter,
  type WorkflowRun,
} from "../shared/workflow.ts";
import type {
  WorkflowInputBinding,
  WorkflowTrigger,
  WorkflowTriggerAttempt,
  WorkflowTriggerAttemptOutcome,
  WorkflowTriggerCreateResult,
  WorkflowTriggerCredential,
  WorkflowTriggerDeliveryResult,
  WorkflowTriggerPreview,
} from "../shared/workflow-trigger.ts";
import { writeFileAtomic } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";
import { parseJson } from "./schema.ts";
import type { WorkflowEngine } from "./workflows/engine.ts";
import { parameterReason, validateWorkflowInputs, workflowStartParameters } from "./workflows/parameters.ts";
import { isActiveRun } from "./workflows/state.ts";
import type { WorkflowStore } from "./workflows/store.ts";

export const WORKFLOW_TRIGGER_MAX_PER_WORKFLOW = 10;
export const WORKFLOW_TRIGGER_MAX_PARAMETERS = 50;
export const WORKFLOW_TRIGGER_MAX_EVENT_TYPES = 20;
export const WORKFLOW_TRIGGER_MAX_PENDING_RUNS = 50;
export const WORKFLOW_TRIGGER_DEFAULT_PENDING_RUNS = 3;
export const WORKFLOW_TRIGGER_MAX_WORKFLOW_PENDING_RUNS = 10;
export const WORKFLOW_TRIGGER_MAX_BODY_BYTES = 256 * 1024;
export const WORKFLOW_TRIGGER_ENDPOINT_RATE = 10;
export const WORKFLOW_TRIGGER_WORKSPACE_RATE = 600;

const RECEIPT_MAX = 20_000;
const RECEIPT_WINDOW_MS = 7 * 24 * 60 * 60_000;
const ATTEMPT_PER_TRIGGER_MAX = 200;
const DELETED_WINDOW_MS = 7 * 24 * 60 * 60_000;
const RATE_WINDOW_MS = 60_000;
const POINTER_MAX_CHARS = 512;
const POINTER_MAX_SEGMENTS = 32;
const TEXT_MAX_BYTES = 32 * 1024;
const LIST_MAX_ITEMS = 1_000;
const MAP_MAX_BYTES = 64 * 1024;
const DELIVERY_ID_MAX = 200;
const UNAUTHORIZED_BURST_MS = 15 * 60_000;
const UNAUTHORIZED_REASON = "Invalid webhook URL or secret";
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const FORBIDDEN_HEADERS = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);
const HEADER_NAME = /^[!#$%&'*+\-.^_|~0-9A-Za-z]+$/;
const PARAMETER_NAME = /^[a-z][a-z0-9_]*$/;
const CANONICAL_INDEX = /^(0|[1-9][0-9]*)$/;
const ON_MISSING = new Set(["reject", "omit"]);

const bindingSchema = z.union([
  z.object({ source: z.literal("payload"), pointer: z.string(), onMissing: z.enum(["reject", "omit"]).optional() }),
  z.object({ source: z.literal("header"), name: z.string(), onMissing: z.enum(["reject", "omit"]).optional() }),
  z.object({ source: z.literal("query"), name: z.string(), onMissing: z.enum(["reject", "omit"]).optional() }),
  z.object({
    source: z.literal("constant"),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ]),
  }),
  z.null(),
]);

const storedTriggerSchema = z.object({
  id: z.string().min(1).max(64),
  workflowId: z.uuid(),
  workflowVersion: z.number().int().min(1),
  workflowName: z.string().min(1).max(80),
  department: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  endpointId: z.string().regex(/^wfw_[A-Za-z0-9_-]{16}$/),
  nodeId: z.string().min(1).max(128).optional(),
  inputs: z.record(z.string(), bindingSchema),
  eventTypes: z.array(z.string().min(1).max(200)).max(WORKFLOW_TRIGGER_MAX_EVENT_TYPES).optional(),
  enabled: z.boolean(),
  maxPendingRuns: z.number().int().min(1).max(WORKFLOW_TRIGGER_MAX_PENDING_RUNS).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  createdBy: z.object({ person: z.string().optional(), botId: z.string().optional() }).optional(),
  lastReceivedAt: z.number().int().nonnegative().optional(),
  lastRunId: z.string().min(1).optional(),
  deliveryCount: z.number().int().nonnegative(),
  credentialResetAt: z.number().int().nonnegative().optional(),
  pausedReason: z.enum(["missing-bot", "missing-workflow", "restored", "frozen", "moved"]).optional(),
  secretHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const receiptSchema = z.object({
  triggerId: z.string().min(1),
  deliveryId: z.string().min(1).max(DELIVERY_ID_MAX),
  runId: z.string().min(1),
  acceptedAt: z.number().int().nonnegative(),
});

const attemptSchema = z.object({
  id: z.string().min(1),
  triggerId: z.string().min(1),
  receivedAt: z.number().int().nonnegative(),
  outcome: z.enum(["accepted", "duplicate", "ignored", "rejected"]),
  statusCode: z.number().int().min(100).max(599),
  deliveryId: z.string().min(1).max(DELIVERY_ID_MAX).optional(),
  eventName: z.string().max(200).optional(),
  runId: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});

const deletedSchema = z.object({
  deletedAt: z.number().int().nonnegative(),
  trigger: storedTriggerSchema,
});

const fileSchema = z.object({
  version: z.literal(1),
  triggers: z.array(storedTriggerSchema),
  receipts: z.array(receiptSchema),
  attempts: z.array(attemptSchema),
  deleted: z.array(deletedSchema),
});

type StoredTrigger = z.output<typeof storedTriggerSchema>;
type Receipt = z.output<typeof receiptSchema>;
type StoredAttempt = z.output<typeof attemptSchema>;
type DeletedTrigger = z.output<typeof deletedSchema>;
type WorkflowTriggerFile = z.output<typeof fileSchema>;

export interface WorkflowTriggerIssue {
  path: string;
  message: string;
}

export interface WorkflowTriggerRefusalBody {
  code?: string;
  error: string;
  issues?: WorkflowTriggerIssue[];
  [key: string]: unknown;
}

/** A refusal a route and the public ingress both turn into a JSON answer. */
export class WorkflowTriggerRefusal extends Error {
  readonly status: number;
  readonly body: WorkflowTriggerRefusalBody;

  constructor(status: number, message: string, body: WorkflowTriggerRefusalBody = { error: message }) {
    super(message);
    this.name = "WorkflowTriggerRefusal";
    this.status = status;
    this.body = body;
  }
}

export interface WorkflowTriggerSample {
  payload?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface WorkflowTriggerDelivery {
  payload: unknown;
  eventName?: string;
  deliveryId?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string[]>;
}

export interface WorkflowTriggerManagerOptions {
  file?: string;
  store: WorkflowStore;
  engine: WorkflowEngine;
  bot(id: string): { id: string } | undefined;
  baseUrl: () => string;
  now?: () => number;
  log?: (line: string) => void;
  /** Test seam: `after-start` simulates a crash between the run and its receipt. Never set outside a fixture. */
  env?: NodeJS.ProcessEnv;
}

interface ParsedCreate {
  name: string;
  workflowVersion?: number;
  inputs: Record<string, unknown>;
  eventTypes?: string[];
  enabled: boolean;
  maxPendingRuns?: number;
  nodeId?: string;
}

interface ParsedPatch {
  name?: string;
  workflowVersion?: number;
  inputs?: Record<string, unknown>;
  eventTypes?: string[];
  enabled?: boolean;
  maxPendingRuns?: number | null;
  nodeId?: string;
}

interface Admission {
  payload: unknown;
  eventName?: string;
  deliveryId?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sameDepartment = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const normalizeDeliveryId = (value: unknown): string => String(value ?? "").trim().slice(0, DELIVERY_ID_MAX);

const hashSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

function secretMatches(secret: string, expectedHex: string): boolean {
  if (!secret) return false;
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const newEndpointId = (): string => `wfw_${randomBytes(12).toString("base64url")}`;
const newSecret = (): string => `wfsec_${randomBytes(32).toString("base64url")}`;

function configurationRefusal(issues: WorkflowTriggerIssue[], status = 400): WorkflowTriggerRefusal {
  const first = issues[0];
  const error = first ? `${first.path}: ${first.message}` : "the trigger configuration is invalid";
  return new WorkflowTriggerRefusal(status, error, { code: "workflowTriggerConfiguration", error, issues });
}

function fail(status: number, message: string, extra: Record<string, unknown> = {}): never {
  throw new WorkflowTriggerRefusal(status, message, { error: message, ...extra });
}

function issue(path: string, message: string): WorkflowTriggerIssue {
  return { path, message };
}

export function parseJsonPointer(pointer: string): { ok: true; segments: string[] } | { ok: false; message: string } {
  if (pointer === "") return { ok: true, segments: [] };
  if (pointer.length > POINTER_MAX_CHARS) return { ok: false, message: `a JSON Pointer may have at most ${POINTER_MAX_CHARS} characters` };
  if (!pointer.startsWith("/")) return { ok: false, message: "a JSON Pointer starts with / (or is empty for the whole payload)" };
  const parts = pointer.slice(1).split("/");
  if (parts.length > POINTER_MAX_SEGMENTS) return { ok: false, message: `a JSON Pointer may have at most ${POINTER_MAX_SEGMENTS} segments` };
  const segments: string[] = [];
  for (const part of parts) {
    if (/~(?![01])/.test(part)) return { ok: false, message: "~ must be followed by 0 or 1 in a JSON Pointer" };
    const segment = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (FORBIDDEN_SEGMENTS.has(segment)) return { ok: false, message: `segment ${JSON.stringify(segment)} is not a property of the payload` };
    segments.push(segment);
  }
  return { ok: true, segments };
}

function readPointer(value: unknown, segments: readonly string[]): { found: true; value: unknown } | { found: false } {
  let current: unknown = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!CANONICAL_INDEX.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== "object") return { found: false };
    if (!Object.hasOwn(current, segment)) return { found: false };
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function headerValues(headers: Record<string, string | string[] | undefined>, name: string): string[] {
  const wanted = name.toLowerCase();
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted || value === undefined) continue;
    if (Array.isArray(value)) values.push(...value);
    else values.push(value);
  }
  return values;
}

function queryValues(query: Record<string, string | string[] | undefined>, name: string): string[] {
  const value = query[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function valueLimitIssue(parameter: WorkflowParameter, value: unknown, path: string): WorkflowTriggerIssue | undefined {
  if (typeof value === "string" && textBytes(value) > TEXT_MAX_BYTES) {
    return issue(path, `text is larger than ${TEXT_MAX_BYTES / 1024} KiB`);
  }
  if (Array.isArray(value)) {
    if (value.length > LIST_MAX_ITEMS) return issue(path, `a list may have at most ${LIST_MAX_ITEMS} items`);
    for (const item of value) {
      if (typeof item === "string" && textBytes(item) > TEXT_MAX_BYTES) {
        return issue(path, `text is larger than ${TEXT_MAX_BYTES / 1024} KiB`);
      }
    }
  }
  const reason = parameterReason(parameter, value);
  return reason ? issue(path, reason) : undefined;
}

function declaredParameters(definition: WorkflowDefinition): Map<string, WorkflowParameter> {
  const map = new Map<string, WorkflowParameter>();
  for (const step of workflowAllSteps(definition)) {
    if (step.kind === "condition" || step.kind === "loop") continue;
    for (const parameter of step.parameters ?? []) {
      if (!map.has(parameter.name)) map.set(parameter.name, parameter);
    }
  }
  return map;
}

function validateBinding(
  raw: unknown,
  parameter: WorkflowParameter,
  path: string,
  issues: WorkflowTriggerIssue[],
): WorkflowInputBinding | undefined {
  if (!isRecord(raw)) {
    issues.push(issue(path, "a binding must be an object or null"));
    return undefined;
  }
  const source = raw.source;
  const allowed: Record<string, readonly string[]> = {
    payload: ["source", "pointer", "onMissing"],
    header: ["source", "name", "onMissing"],
    query: ["source", "name", "onMissing"],
    constant: ["source", "value", "onMissing"],
  };
  if (typeof source !== "string" || !Object.hasOwn(allowed, source)) {
    issues.push(issue(`${path}.source`, "\"source\" must be payload, header, query or constant"));
    return undefined;
  }
  for (const key of Object.keys(raw)) {
    if (!allowed[source]!.includes(key)) issues.push(issue(`${path}.${key}`, "field is not part of this binding"));
  }
  const onMissing = raw.onMissing;
  if (onMissing !== undefined && (typeof onMissing !== "string" || !ON_MISSING.has(onMissing))) {
    issues.push(issue(`${path}.onMissing`, "\"onMissing\" must be reject or omit"));
  }
  if (source !== "constant" && parameter.required && onMissing === "omit") {
    issues.push(issue(`${path}.onMissing`, "omit only applies to an optional parameter"));
  }

  if (source === "payload") {
    const pointer = raw.pointer;
    if (typeof pointer !== "string") {
      issues.push(issue(`${path}.pointer`, "\"pointer\" must be a JSON Pointer"));
      return undefined;
    }
    const parsed = parseJsonPointer(pointer);
    if (!parsed.ok) {
      issues.push(issue(`${path}.pointer`, parsed.message));
      return undefined;
    }
    return { source, pointer, ...(onMissing === "reject" || onMissing === "omit" ? { onMissing } : {}) };
  }

  if (source === "header" || source === "query") {
    const name = raw.name;
    if (typeof name !== "string" || !name.trim() || textBytes(name) > 200) {
      issues.push(issue(`${path}.name`, `"name" must be a non-empty ${source} name`));
      return undefined;
    }
    if (source === "header" && !HEADER_NAME.test(name.trim())) {
      issues.push(issue(`${path}.name`, "\"name\" must be a valid header name"));
      return undefined;
    }
    if (source === "header" && FORBIDDEN_HEADERS.has(name.trim().toLowerCase())) {
      issues.push(issue(`${path}.name`, "an authentication header cannot be a parameter source"));
      return undefined;
    }
    if (!parameter.list && parameter.type !== "string" && parameter.type !== "date" && parameter.type !== "enum") {
      issues.push(issue(path, `a ${source} supplies text only; parameter ${JSON.stringify(parameter.name)} is ${parameter.type}`));
      return undefined;
    }
    if (parameter.list) {
      issues.push(issue(path, `a ${source} supplies one value, not a list`));
      return undefined;
    }
    return { source, name: name.trim(), ...(onMissing === "reject" || onMissing === "omit" ? { onMissing } : {}) };
  }

  const value = raw.value;
  if (value === undefined || value === null || (!Array.isArray(value) && typeof value === "object")) {
    issues.push(issue(`${path}.value`, "a constant must be a scalar or a list of scalars"));
    return undefined;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(issue(`${path}.value`, "a constant number must be finite"));
    return undefined;
  }
  if (Array.isArray(value) && value.length > LIST_MAX_ITEMS) {
    issues.push(issue(`${path}.value`, `a constant list may have at most ${LIST_MAX_ITEMS} items`));
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === null || typeof item === "object" || (typeof item === "number" && !Number.isFinite(item))) {
        issues.push(issue(`${path}.value`, "a constant list holds only text, numbers or booleans"));
        return undefined;
      }
    }
  }
  const limit = valueLimitIssue(parameter, value, `${path}.value`);
  if (limit) {
    issues.push(limit);
    return undefined;
  }
  return { source: "constant", value: value as string | number | boolean | Array<string | number | boolean> };
}

function validateInputs(
  definition: WorkflowDefinition,
  inputs: Record<string, unknown>,
  issues: WorkflowTriggerIssue[],
): Record<string, WorkflowInputBinding> {
  const start = workflowStartParameters(definition);
  if (start.length > WORKFLOW_TRIGGER_MAX_PARAMETERS) {
    issues.push(issue("inputs", `a Workflow may receive at most ${WORKFLOW_TRIGGER_MAX_PARAMETERS} start parameters`));
    return {};
  }
  const declared = declaredParameters(definition);
  const startNames = new Set(start.map((parameter) => parameter.name));
  for (const key of Object.keys(inputs)) {
    if (startNames.has(key)) continue;
    const parameter = declared.get(key);
    if (parameter?.from !== undefined || parameter?.collectedBy !== undefined) {
      issues.push(issue(`inputs.${key}`, "a parameter with from or collectedBy never comes from a trigger"));
    } else {
      issues.push(issue(`inputs.${key}`, "unknown parameter; only initial parameters belong in the map"));
    }
  }
  const normalized: Record<string, WorkflowInputBinding> = {};
  for (const parameter of start) {
    const path = `inputs.${parameter.name}`;
    if (!PARAMETER_NAME.test(parameter.name)) {
      issues.push(issue(path, "parameter names use lowercase letters, digits and _ only"));
      continue;
    }
    if (!Object.hasOwn(inputs, parameter.name)) {
      issues.push(issue(path, parameter.required
        ? "a required parameter needs a binding"
        : "a parameter needs a binding or null to be omitted"));
      continue;
    }
    const raw = inputs[parameter.name];
    if (raw === null) {
      if (parameter.required) issues.push(issue(path, "a required parameter cannot be null"));
      else normalized[parameter.name] = null;
      continue;
    }
    const binding = validateBinding(raw, parameter, path, issues);
    if (binding) normalized[parameter.name] = binding;
  }
  if (issues.length === 0) {
    const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
    if (bytes > MAP_MAX_BYTES) issues.push(issue("inputs", `the parameter map is larger than ${MAP_MAX_BYTES / 1024} KiB`));
  }
  return normalized;
}

function cleanEventTypes(raw: unknown, issues: WorkflowTriggerIssue[], path: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    issues.push(issue(path, "eventTypes must be a list"));
    return undefined;
  }
  const types: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim() || textBytes(entry.trim()) > 200) {
      issues.push(issue(path, "every event type must be a non-empty text of at most 200 characters"));
      return undefined;
    }
    if (!types.includes(entry.trim())) types.push(entry.trim());
  }
  if (types.length > WORKFLOW_TRIGGER_MAX_EVENT_TYPES) {
    issues.push(issue(path, `eventTypes accepts at most ${WORKFLOW_TRIGGER_MAX_EVENT_TYPES} names`));
    return undefined;
  }
  return types;
}

function parseCreate(value: unknown): ParsedCreate {
  if (!isRecord(value)) throw configurationRefusal([issue("trigger", "the body must be a JSON object")]);
  const allowed = new Set(["name", "workflowVersion", "inputs", "eventTypes", "enabled", "maxPendingRuns", "nodeId"]);
  const issues: WorkflowTriggerIssue[] = [];
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue(key, "field is not part of a Workflow trigger"));
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 80) issues.push(issue("name", "name must be 1-80 characters"));
  let workflowVersion: number | undefined;
  if (value.workflowVersion !== undefined) {
    if (!Number.isSafeInteger(value.workflowVersion) || Number(value.workflowVersion) < 1) {
      issues.push(issue("workflowVersion", "workflowVersion must be a positive integer"));
    } else {
      workflowVersion = Number(value.workflowVersion);
    }
  }
  if (!isRecord(value.inputs)) issues.push(issue("inputs", "inputs must be an object keyed by start parameter"));
  const eventTypes = cleanEventTypes(value.eventTypes, issues, "eventTypes");
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") issues.push(issue("enabled", "enabled must be true or false"));
  let maxPendingRuns: number | undefined;
  if (value.maxPendingRuns !== undefined && value.maxPendingRuns !== null) {
    if (!Number.isSafeInteger(value.maxPendingRuns) || Number(value.maxPendingRuns) < 1 || Number(value.maxPendingRuns) > WORKFLOW_TRIGGER_MAX_PENDING_RUNS) {
      issues.push(issue("maxPendingRuns", `maxPendingRuns must be 1-${WORKFLOW_TRIGGER_MAX_PENDING_RUNS} or null`));
    } else {
      maxPendingRuns = Number(value.maxPendingRuns);
    }
  }
  let nodeId: string | undefined;
  if (value.nodeId !== undefined) {
    if (typeof value.nodeId !== "string" || !value.nodeId.trim() || value.nodeId.trim().length > 128) {
      issues.push(issue("nodeId", "nodeId must be a non-empty text of at most 128 characters"));
    } else {
      nodeId = value.nodeId.trim();
    }
  }
  if (issues.length > 0) throw configurationRefusal(issues);
  return {
    name,
    ...(workflowVersion === undefined ? {} : { workflowVersion }),
    inputs: value.inputs as Record<string, unknown>,
    ...(eventTypes === undefined ? {} : { eventTypes }),
    enabled: value.enabled !== false,
    ...(maxPendingRuns === undefined ? {} : { maxPendingRuns }),
    ...(nodeId === undefined ? {} : { nodeId }),
  };
}

function parsePatch(value: unknown): ParsedPatch {
  if (!isRecord(value)) throw configurationRefusal([issue("trigger", "the body must be a JSON object")]);
  const allowed = new Set(["name", "workflowVersion", "inputs", "eventTypes", "enabled", "maxPendingRuns", "nodeId"]);
  const issues: WorkflowTriggerIssue[] = [];
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue(key, "field is not part of a Workflow trigger"));
  const patch: ParsedPatch = {};
  if (value.name !== undefined) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!name || name.length > 80) issues.push(issue("name", "name must be 1-80 characters"));
    else patch.name = name;
  }
  if (value.workflowVersion !== undefined) {
    if (!Number.isSafeInteger(value.workflowVersion) || Number(value.workflowVersion) < 1) {
      issues.push(issue("workflowVersion", "workflowVersion must be a positive integer"));
    } else {
      patch.workflowVersion = Number(value.workflowVersion);
    }
  }
  if (value.inputs !== undefined) {
    if (!isRecord(value.inputs)) issues.push(issue("inputs", "inputs must be an object keyed by start parameter"));
    else patch.inputs = value.inputs;
  }
  const eventTypes = cleanEventTypes(value.eventTypes, issues, "eventTypes");
  if (eventTypes !== undefined) patch.eventTypes = eventTypes;
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") issues.push(issue("enabled", "enabled must be true or false"));
    else patch.enabled = value.enabled;
  }
  if (value.maxPendingRuns !== undefined) {
    if (value.maxPendingRuns === null) patch.maxPendingRuns = null;
    else if (!Number.isSafeInteger(value.maxPendingRuns) || Number(value.maxPendingRuns) < 1 || Number(value.maxPendingRuns) > WORKFLOW_TRIGGER_MAX_PENDING_RUNS) {
      issues.push(issue("maxPendingRuns", `maxPendingRuns must be 1-${WORKFLOW_TRIGGER_MAX_PENDING_RUNS} or null`));
    } else {
      patch.maxPendingRuns = Number(value.maxPendingRuns);
    }
  }
  if (value.nodeId !== undefined) {
    if (typeof value.nodeId !== "string" || !value.nodeId.trim() || value.nodeId.trim().length > 128) {
      issues.push(issue("nodeId", "nodeId must be a non-empty text of at most 128 characters"));
    } else {
      patch.nodeId = value.nodeId.trim();
    }
  }
  if (issues.length > 0) throw configurationRefusal(issues);
  return patch;
}

function publicTrigger(trigger: StoredTrigger): WorkflowTrigger {
  const { secretHash: _secretHash, ...safe } = trigger;
  return structuredClone(safe);
}

function credentialFor(baseUrl: string, endpointId: string, secret: string): WorkflowTriggerCredential {
  const url = `${baseUrl.replace(/\/+$/, "")}/hooks/${endpointId}/${encodeURIComponent(secret)}`;
  return { secret, url };
}

function receiptKey(triggerId: string, deliveryId: string): string {
  return `${triggerId}\u0000${deliveryId}`;
}

export class WorkflowTriggerManager {
  private readonly file: string;
  private readonly store: WorkflowStore;
  private readonly engine: WorkflowEngine;
  private readonly bot: WorkflowTriggerManagerOptions["bot"];
  private readonly baseUrl: () => string;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly env: NodeJS.ProcessEnv;
  private triggers: StoredTrigger[] = [];
  private receipts: Receipt[] = [];
  private receiptIndex = new Map<string, string>();
  private attempts: StoredAttempt[] = [];
  private deleted: DeletedTrigger[] = [];
  private readonly deliveryRuns = new Map<string, string>();
  private readonly activeRuns = new Map<string, Map<string, WorkflowRun["status"]>>();
  private readonly inFlight = new Map<string, Promise<WorkflowTriggerDeliveryResult>>();
  private readonly endpointRate = new Map<string, number[]>();
  private workspaceRate: number[] = [];
  private unreadable = false;

  constructor(options: WorkflowTriggerManagerOptions) {
    this.store = options.store;
    this.engine = options.engine;
    this.bot = options.bot;
    this.baseUrl = options.baseUrl;
    this.file = options.file ?? join(DATA_DIR, "workflow-triggers.json");
    this.now = options.now ?? Date.now;
    this.log = options.log ?? ((line: string) => console.warn(line));
    this.env = options.env ?? process.env;
    try {
      const parsed = fileSchema.safeParse(parseJson(readFileSync(this.file, "utf8")));
      if (!parsed.success) throw parsed.error;
      this.triggers = parsed.data.triggers;
      this.receipts = parsed.data.receipts;
      this.attempts = parsed.data.attempts;
      this.deleted = parsed.data.deleted;
    } catch (error) {
      this.triggers = [];
      this.receipts = [];
      this.attempts = [];
      this.deleted = [];
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.unreadable = true;
        const reason = error instanceof SyntaxError ? "invalid JSON" : error instanceof Error ? error.message : "unable to read workflow triggers";
        this.log(`workflow triggers: ignoring unreadable ${this.file}: ${reason}`);
      }
    }
    this.prune();
    this.rebuildFromRuns();
  }

  private rebuildFromRuns(): void {
    let changed = false;
    for (const run of this.store.listRuns({ limit: Number.POSITIVE_INFINITY })) {
      const trigger = run.triggeredBy;
      if (!trigger || !("triggerId" in trigger)) continue;
      const key = receiptKey(trigger.triggerId, trigger.deliveryId);
      this.registerRun(run);
      if (this.receiptIndex.has(key)) continue;
      this.receipts.push({ triggerId: trigger.triggerId, deliveryId: trigger.deliveryId, runId: run.id, acceptedAt: run.createdAt });
      this.receiptIndex.set(key, run.id);
      changed = true;
    }
    if (!changed) return;
    this.prune();
    try {
      this.save();
    } catch (error) {
      this.log(`workflow triggers: could not persist rebuilt receipts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Mirrors a run transition into the in-memory index; a restart rebuilds the same map from run.json. */
  noteRun(run: WorkflowRun): void {
    this.registerRun(run);
  }

  private registerRun(run: WorkflowRun): void {
    const trigger = run.triggeredBy;
    if (!trigger || !("triggerId" in trigger)) return;
    this.deliveryRuns.set(receiptKey(trigger.triggerId, trigger.deliveryId), run.id);
    const active = this.activeRuns.get(trigger.triggerId) ?? new Map<string, WorkflowRun["status"]>();
    if (isActiveRun(run.status)) active.set(run.id, run.status);
    else active.delete(run.id);
    if (active.size > 0) this.activeRuns.set(trigger.triggerId, active);
    else this.activeRuns.delete(trigger.triggerId);
  }

  private prune(): void {
    const now = this.now();
    const cutoff = now - RECEIPT_WINDOW_MS;
    this.receipts = this.receipts.filter((receipt) => receipt.acceptedAt >= cutoff);
    this.receipts.sort((left, right) => left.acceptedAt - right.acceptedAt);
    if (this.receipts.length > RECEIPT_MAX) this.receipts.splice(0, this.receipts.length - RECEIPT_MAX);
    this.receiptIndex = new Map(this.receipts.map((receipt) => [receiptKey(receipt.triggerId, receipt.deliveryId), receipt.runId]));
    const counts = new Map<string, number>();
    const kept: StoredAttempt[] = [];
    for (let index = this.attempts.length - 1; index >= 0; index -= 1) {
      const attempt = this.attempts[index]!;
      const count = counts.get(attempt.triggerId) ?? 0;
      if (count >= ATTEMPT_PER_TRIGGER_MAX) continue;
      counts.set(attempt.triggerId, count + 1);
      kept.push(attempt);
    }
    this.attempts = kept.reverse();
    this.deleted = this.deleted.filter((entry) => entry.deletedAt >= now - DELETED_WINDOW_MS);
  }

  private save(): void {
    if (this.unreadable) return;
    this.prune();
    const body: WorkflowTriggerFile = {
      version: 1,
      triggers: this.triggers,
      receipts: this.receipts,
      attempts: this.attempts,
      deleted: this.deleted,
    };
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileAtomic(this.file, JSON.stringify(body, null, 2), { mode: 0o600 });
  }

  private assertWritable(): void {
    if (this.unreadable) fail(503, "Saved Workflow triggers could not be read. Repair workflow-triggers.json before changing them.");
  }

  private find(triggerId: string): StoredTrigger | undefined {
    return this.triggers.find((trigger) => trigger.id === triggerId);
  }

  private findForWorkflow(workflowId: string, triggerId: string): StoredTrigger | undefined {
    return this.triggers.find((trigger) => trigger.id === triggerId && trigger.workflowId === workflowId);
  }

  list(workflowId: string): WorkflowTrigger[] {
    return this.triggers.filter((trigger) => trigger.workflowId === workflowId).map(publicTrigger);
  }

  /** The department view: status only, with no credential and no constant value. */
  listDepartment(limit = 100, department?: string): Array<Omit<WorkflowTrigger, "inputs">> {
    return this.triggers
      .filter((trigger) => department === undefined || sameDepartment(trigger.department, department))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((trigger) => {
        const { inputs: _inputs, ...safe } = publicTrigger(trigger);
        return safe;
      });
  }

  listDeleted(workflowId: string): Array<{ deletedAt: number; trigger: WorkflowTrigger }> {
    const cutoff = this.now() - DELETED_WINDOW_MS;
    return this.deleted
      .filter((entry) => entry.trigger.workflowId === workflowId && entry.deletedAt >= cutoff)
      .map((entry) => ({ deletedAt: entry.deletedAt, trigger: publicTrigger(entry.trigger) }));
  }

  get(workflowId: string, triggerId: string): WorkflowTrigger | undefined {
    const trigger = this.findForWorkflow(workflowId, triggerId);
    return trigger ? publicTrigger(trigger) : undefined;
  }

  hasTriggers(workflowId: string): boolean {
    return this.triggers.some((trigger) => trigger.workflowId === workflowId);
  }

  private definitionFor(workflowId: string, version?: number): { definition: WorkflowDefinition; version: number } {
    const definition = this.store.workflow(workflowId, version);
    if (!definition) {
      if (version === undefined) fail(404, `no Workflow ${JSON.stringify(workflowId)}`);
      fail(404, `no Workflow ${JSON.stringify(workflowId)} version ${version}`);
    }
    return { definition, version: definition.version };
  }

  create(workflowId: string, value: unknown): WorkflowTriggerCreateResult {
    this.assertWritable();
    const input = parseCreate(value);
    const { definition } = this.definitionFor(workflowId, input.workflowVersion);
    if (this.triggers.filter((trigger) => trigger.workflowId === workflowId).length >= WORKFLOW_TRIGGER_MAX_PER_WORKFLOW) {
      fail(409, `a Workflow accepts at most ${WORKFLOW_TRIGGER_MAX_PER_WORKFLOW} webhook triggers`);
    }
    if (input.nodeId !== undefined && this.triggers.some((trigger) => trigger.workflowId === workflowId && trigger.nodeId === input.nodeId)) {
      fail(409, "this Studio trigger already has a configuration");
    }
    const issues: WorkflowTriggerIssue[] = [];
    const inputs = validateInputs(definition, input.inputs, issues);
    if (issues.length > 0) throw configurationRefusal(issues);
    const now = this.now();
    const secret = newSecret();
    const trigger: StoredTrigger = {
      id: randomUUID(),
      workflowId,
      workflowVersion: definition.version,
      workflowName: definition.name,
      department: definition.department,
      name: input.name,
      endpointId: newEndpointId(),
      inputs,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
      deliveryCount: 0,
      secretHash: hashSecret(secret),
      ...(input.eventTypes === undefined || input.eventTypes.length === 0 ? {} : { eventTypes: input.eventTypes }),
      ...(input.maxPendingRuns === undefined ? {} : { maxPendingRuns: input.maxPendingRuns }),
      ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    };
    this.triggers.push(trigger);
    try {
      this.save();
    } catch (error) {
      this.triggers.pop();
      throw error;
    }
    return { trigger: publicTrigger(trigger), credential: credentialFor(this.baseUrl(), trigger.endpointId, secret) };
  }

  update(workflowId: string, triggerId: string, value: unknown): WorkflowTrigger {
    this.assertWritable();
    const trigger = this.findForWorkflow(workflowId, triggerId);
    if (!trigger) fail(404, "no such Workflow trigger");
    const patch = parsePatch(value);
    if (patch.nodeId !== undefined
      && this.triggers.some((candidate) => candidate.id !== trigger.id && candidate.workflowId === workflowId && candidate.nodeId === patch.nodeId)) {
      fail(409, "this Studio trigger already has a configuration");
    }
    const version = patch.workflowVersion ?? trigger.workflowVersion;
    const { definition } = this.definitionFor(workflowId, version);
    if (!sameDepartment(definition.department, trigger.department)) {
      fail(409, "that Workflow version belongs to another department");
    }
    const issues: WorkflowTriggerIssue[] = [];
    const inputs = validateInputs(definition, patch.inputs ?? trigger.inputs, issues);
    if (issues.length > 0) throw configurationRefusal(issues);
    const index = this.triggers.indexOf(trigger);
    const before = structuredClone(trigger);
    if (patch.name !== undefined) trigger.name = patch.name;
    trigger.workflowVersion = definition.version;
    trigger.workflowName = definition.name;
    trigger.inputs = inputs;
    if (patch.eventTypes !== undefined) {
      if (patch.eventTypes.length === 0) delete trigger.eventTypes;
      else trigger.eventTypes = patch.eventTypes;
    }
    if (patch.enabled !== undefined) {
      trigger.enabled = patch.enabled;
      if (patch.enabled) delete trigger.pausedReason;
    }
    if (patch.maxPendingRuns !== undefined) {
      if (patch.maxPendingRuns === null) delete trigger.maxPendingRuns;
      else trigger.maxPendingRuns = patch.maxPendingRuns;
    }
    if (patch.nodeId !== undefined) trigger.nodeId = patch.nodeId;
    trigger.updatedAt = this.now();
    try {
      this.save();
    } catch (error) {
      if (index !== -1) this.triggers[index] = before;
      throw error;
    }
    return publicTrigger(trigger);
  }

  remove(workflowId: string, triggerId: string): { deleted: true; undoUntil: number } {
    this.assertWritable();
    const index = this.triggers.findIndex((trigger) => trigger.id === triggerId && trigger.workflowId === workflowId);
    if (index === -1) fail(404, "no such Workflow trigger");
    const beforeTriggers = [...this.triggers];
    const beforeDeleted = this.deleted;
    const beforeReceipts = this.receipts;
    const [trigger] = this.triggers.splice(index, 1);
    const now = this.now();
    this.endpointRate.delete(trigger.endpointId);
    this.deleted = [...this.deleted.filter((entry) => entry.trigger.id !== triggerId), { deletedAt: now, trigger }];
    this.receipts = this.receipts.filter((receipt) => receipt.triggerId !== triggerId);
    this.prune();
    try {
      this.save();
    } catch (error) {
      this.triggers = beforeTriggers;
      this.deleted = beforeDeleted;
      this.receipts = beforeReceipts;
      throw error;
    }
    return { deleted: true, undoUntil: now + DELETED_WINDOW_MS };
  }

  removeForWorkflow(workflowId: string): number {
    const live = this.triggers.filter((trigger) => trigger.workflowId === workflowId);
    if (live.length === 0) return 0;
    this.assertWritable();
    const beforeTriggers = this.triggers;
    const beforeDeleted = this.deleted;
    const beforeReceipts = this.receipts;
    const now = this.now();
    const ids = new Set(live.map((trigger) => trigger.id));
    for (const trigger of live) this.endpointRate.delete(trigger.endpointId);
    this.triggers = this.triggers.filter((trigger) => !ids.has(trigger.id));
    this.deleted = [...this.deleted.filter((entry) => !ids.has(entry.trigger.id)), ...live.map((trigger) => ({ deletedAt: now, trigger }))];
    this.receipts = this.receipts.filter((receipt) => !ids.has(receipt.triggerId));
    this.prune();
    try {
      this.save();
    } catch (error) {
      this.triggers = beforeTriggers;
      this.deleted = beforeDeleted;
      this.receipts = beforeReceipts;
      throw error;
    }
    return live.length;
  }

  /** Brings a deleted trigger back with a fresh credential; null when its week is over. */
  restore(workflowId: string, triggerId: string): WorkflowTriggerCreateResult {
    this.assertWritable();
    const cutoff = this.now() - DELETED_WINDOW_MS;
    const entry = this.deleted.find((candidate) => candidate.trigger.id === triggerId
      && candidate.trigger.workflowId === workflowId
      && candidate.deletedAt >= cutoff);
    if (!entry) fail(404, "no such deleted Workflow trigger");
    if (this.find(triggerId)) fail(409, "that Workflow trigger already exists");
    if (entry.trigger.nodeId !== undefined
      && this.triggers.some((candidate) => candidate.workflowId === workflowId && candidate.nodeId === entry.trigger.nodeId)) {
      fail(409, "this Studio trigger already has a configuration");
    }
    const { definition } = this.definitionFor(workflowId, entry.trigger.workflowVersion);
    if (!sameDepartment(definition.department, entry.trigger.department)) {
      fail(409, "that Workflow version belongs to another department");
    }
    const secret = newSecret();
    const now = this.now();
    const trigger: StoredTrigger = {
      ...entry.trigger,
      endpointId: newEndpointId(),
      secretHash: hashSecret(secret),
      credentialResetAt: now,
      updatedAt: now,
    };
    const beforeDeleted = this.deleted;
    this.deleted = this.deleted.filter((candidate) => candidate !== entry);
    this.triggers.push(trigger);
    try {
      this.save();
    } catch (error) {
      this.deleted = beforeDeleted;
      this.triggers.pop();
      throw error;
    }
    return { trigger: publicTrigger(trigger), credential: credentialFor(this.baseUrl(), trigger.endpointId, secret) };
  }

  rotateSecret(workflowId: string, triggerId: string): WorkflowTriggerCreateResult {
    this.assertWritable();
    const trigger = this.findForWorkflow(workflowId, triggerId);
    if (!trigger) fail(404, "no such Workflow trigger");
    const secret = newSecret();
    const before = structuredClone(trigger);
    const index = this.triggers.indexOf(trigger);
    trigger.secretHash = hashSecret(secret);
    trigger.updatedAt = this.now();
    try {
      this.save();
    } catch (error) {
      if (index !== -1) this.triggers[index] = before;
      throw error;
    }
    return { trigger: publicTrigger(trigger), credential: credentialFor(this.baseUrl(), trigger.endpointId, secret) };
  }

  listAttempts(workflowId: string, triggerId: string, limit = 50): { attempts: WorkflowTriggerAttempt[]; truncated: boolean } {
    if (!this.findForWorkflow(workflowId, triggerId)) fail(404, "no such Workflow trigger");
    const list = this.attempts.filter((attempt) => attempt.triggerId === triggerId);
    const size = Math.max(1, Math.min(ATTEMPT_PER_TRIGGER_MAX, limit));
    const sorted = [...list].sort((left, right) => right.receivedAt - left.receivedAt || (left.id < right.id ? 1 : -1));
    return { attempts: sorted.slice(0, size), truncated: sorted.length > size };
  }

  preview(workflowId: string, triggerId: string, value: unknown): WorkflowTriggerPreview {
    const trigger = this.findForWorkflow(workflowId, triggerId);
    if (!trigger) fail(404, "no such Workflow trigger");
    if (!isRecord(value)) throw configurationRefusal([issue("preview", "the body must be a JSON object")]);
    const allowed = new Set(["payload", "headers", "query"]);
    const issues: WorkflowTriggerIssue[] = [];
    for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue(key, "field is not part of a preview"));
    const headers = normalizeHeaderSample(value.headers, issues);
    const query = normalizeQuerySample(value.query, issues);
    if (issues.length > 0) throw configurationRefusal(issues);
    const { definition } = this.definitionFor(workflowId, trigger.workflowVersion);
    const admitted: Admission = {
      payload: value.payload,
      headers,
      query,
      ...(typeof value.eventName === "string" ? { eventName: value.eventName } : {}),
    };
    const resolved = this.resolve(definition, trigger.inputs, admitted);
    if (!resolved.ok) throw configurationRefusal(resolved.issues, 422);
    const validated = validateWorkflowInputs(definition, resolved.values);
    if (!validated.ok) throw configurationRefusal(validationIssues(validated.failure), 422);
    return { workflowVersion: definition.version, resolvedInputs: validated.values, omitted: resolved.omitted };
  }

  private resolve(
    definition: WorkflowDefinition,
    inputs: Record<string, WorkflowInputBinding>,
    admission: Admission,
  ): { ok: true; values: Record<string, unknown>; omitted: string[] } | { ok: false; issues: WorkflowTriggerIssue[] } {
    const values: Record<string, unknown> = {};
    const omitted: string[] = [];
    const issues: WorkflowTriggerIssue[] = [];
    for (const parameter of workflowStartParameters(definition)) {
      const path = `inputs.${parameter.name}`;
      const binding = inputs[parameter.name];
      if (binding === null || binding === undefined) {
        omitted.push(parameter.name);
        continue;
      }
      const onMissing = binding.source === "constant" ? undefined : binding.onMissing;
      const missing = (): void => {
        if (onMissing === "reject") issues.push(issue(path, "the value is absent and onMissing is reject"));
        else omitted.push(parameter.name);
      };
      let value: unknown;
      if (binding.source === "payload") {
        const pointer = parseJsonPointer(binding.pointer);
        if (!pointer.ok) {
          issues.push(issue(`${path}.pointer`, pointer.message));
          continue;
        }
        const read = readPointer(admission.payload, pointer.segments);
        if (!read.found) {
          missing();
          continue;
        }
        value = read.value;
      } else if (binding.source === "header") {
        if (FORBIDDEN_HEADERS.has(binding.name.toLowerCase())) {
          issues.push(issue(`${path}.name`, "an authentication header cannot be a parameter source"));
          continue;
        }
        const found = headerValues(admission.headers, binding.name);
        if (found.length > 1) {
          issues.push(issue(path, `header ${JSON.stringify(binding.name)} appears more than once`));
          continue;
        }
        if (found.length === 0) {
          missing();
          continue;
        }
        value = found[0];
      } else if (binding.source === "query") {
        const found = queryValues(admission.query, binding.name);
        if (found.length > 1) {
          issues.push(issue(path, `query ${JSON.stringify(binding.name)} appears more than once`));
          continue;
        }
        if (found.length === 0) {
          missing();
          continue;
        }
        value = found[0];
      } else {
        value = binding.value;
      }
      const limit = valueLimitIssue(parameter, value, path);
      if (limit) {
        issues.push(limit);
        continue;
      }
      values[parameter.name] = value;
    }
    if (issues.length > 0) return { ok: false, issues };
    const bytes = Buffer.byteLength(JSON.stringify(values), "utf8");
    if (bytes > MAP_MAX_BYTES) return { ok: false, issues: [issue("inputs", `resolved values are larger than ${MAP_MAX_BYTES / 1024} KiB`)] };
    return { ok: true, values, omitted };
  }

  authorize(endpointId: string, secret: string): boolean {
    const trigger = this.triggers.find((candidate) => candidate.endpointId === endpointId);
    return Boolean(trigger && secretMatches(secret, trigger.secretHash));
  }

  async receive(endpointId: string, secret: string, delivery: WorkflowTriggerDelivery): Promise<WorkflowTriggerDeliveryResult> {
    const trigger = this.triggers.find((candidate) => candidate.endpointId === endpointId);
    if (!trigger || !secretMatches(secret, trigger.secretHash)) fail(401, UNAUTHORIZED_REASON);
    const now = this.now();
    const deliveryId = normalizeDeliveryId(delivery.deliveryId) || randomUUID();
    const admission: Admission = {
      payload: delivery.payload,
      headers: delivery.headers,
      query: delivery.query,
      ...(delivery.eventName === undefined ? {} : { eventName: delivery.eventName }),
      deliveryId,
    };
    this.admitRate(trigger, admission, now);
    const key = receiptKey(trigger.id, deliveryId);
    const duplicateRunId = this.receiptIndex.get(key) ?? this.deliveryRuns.get(key);
    if (duplicateRunId !== undefined) {
      this.record(trigger, "duplicate", 202, admission, {
        runId: duplicateRunId,
        reason: "Duplicate delivery ignored",
      });
      this.saveQuietly();
      return { accepted: true, runId: duplicateRunId, deliveryId, duplicate: true };
    }
    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      const result = await inFlight;
      return { ...result, duplicate: result.runId !== undefined ? true : result.duplicate };
    }
    const pending = this.receiveLocked(trigger, endpointId, deliveryId, admission);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  private async receiveLocked(
    initial: StoredTrigger,
    endpointId: string,
    deliveryId: string,
    admission: Admission,
  ): Promise<WorkflowTriggerDeliveryResult> {
    const trigger = this.triggers.find((candidate) => candidate.id === initial.id && candidate.endpointId === endpointId);
    if (!trigger) fail(401, UNAUTHORIZED_REASON);
    if (!trigger.enabled) {
      this.record(trigger, "rejected", 409, admission, { reason: "This Workflow trigger is paused" });
      this.saveQuietly();
      fail(409, "This Workflow trigger is paused");
    }
    if (trigger.pausedReason !== undefined) {
      const message = reasonMessage(trigger.pausedReason);
      this.record(trigger, "rejected", 409, admission, { reason: message });
      this.saveQuietly();
      fail(409, message);
    }
    const definition = this.store.workflow(trigger.workflowId, trigger.workflowVersion);
    if (!definition) {
      trigger.pausedReason = "missing-workflow";
      trigger.updatedAt = this.now();
      this.record(trigger, "rejected", 409, admission, { reason: "The Workflow or its pinned version is missing" });
      this.saveQuietly();
      fail(409, "The Workflow or its pinned version is missing");
    }
    if (!sameDepartment(definition.department, trigger.department)) {
      trigger.pausedReason = "missing-workflow";
      trigger.updatedAt = this.now();
      this.record(trigger, "rejected", 409, admission, { reason: "The pinned Workflow version belongs to another department" });
      this.saveQuietly();
      fail(409, "The pinned Workflow version belongs to another department");
    }
    const missingBot = workflowAllSteps(definition).find((step) => isBotStep(step) && !this.bot(step.botId));
    if (missingBot) {
      trigger.pausedReason = "missing-bot";
      trigger.updatedAt = this.now();
      this.record(trigger, "rejected", 409, admission, { reason: "A bot this Workflow needs is missing" });
      this.saveQuietly();
      fail(409, "A bot this Workflow needs is missing");
    }
    const allowed = trigger.eventTypes ?? [];
    if (allowed.length > 0 && (!admission.eventName || !allowed.includes(admission.eventName))) {
      this.record(trigger, "ignored", 202, admission, {
        reason: admission.eventName ? `Event type “${admission.eventName}” is not enabled` : "Event type is missing",
      });
      this.saveQuietly();
      return { accepted: true, deliveryId, duplicate: false, ignored: true };
    }
    const live = this.activeRuns.get(trigger.id);
    const pending = live?.size ?? 0;
    const maxPending = trigger.maxPendingRuns ?? WORKFLOW_TRIGGER_DEFAULT_PENDING_RUNS;
    if (pending >= maxPending) {
      const states = [...(live?.values() ?? [])];
      const message = `this trigger already has ${pending} unfinished ${pending === 1 ? "run" : "runs"} (its limit is ${maxPending})`;
      this.record(trigger, "rejected", 429, admission, { reason: message });
      this.saveQuietly();
      fail(429, message, { pending, limit: maxPending, states });
    }
    const workflowPending = this.triggers
      .filter((candidate) => candidate.workflowId === trigger.workflowId)
      .reduce((total, candidate) => total + (this.activeRuns.get(candidate.id)?.size ?? 0), 0);
    if (workflowPending >= WORKFLOW_TRIGGER_MAX_WORKFLOW_PENDING_RUNS) {
      const message = `this Workflow already has ${workflowPending} unfinished runs from triggers (its limit is ${WORKFLOW_TRIGGER_MAX_WORKFLOW_PENDING_RUNS})`;
      this.record(trigger, "rejected", 429, admission, { reason: message });
      this.saveQuietly();
      fail(429, message, { pending: workflowPending, limit: WORKFLOW_TRIGGER_MAX_WORKFLOW_PENDING_RUNS });
    }
    const resolved = this.resolve(definition, trigger.inputs, admission);
    if (!resolved.ok) {
      const refusal = configurationRefusal(resolved.issues, 422);
      this.record(trigger, "rejected", 422, admission, { reason: refusal.message });
      this.saveQuietly();
      throw refusal;
    }
    const validated = validateWorkflowInputs(definition, resolved.values);
    if (!validated.ok) {
      const refusal = configurationRefusal(validationIssues(validated.failure), 422);
      this.record(trigger, "rejected", 422, admission, { reason: refusal.message });
      this.saveQuietly();
      throw refusal;
    }
    const current = this.find(trigger.id);
    if (!current || current.endpointId !== endpointId) fail(401, UNAUTHORIZED_REASON);
    if (!current.enabled || current.pausedReason !== undefined) {
      const message = "This Workflow trigger changed before the run was created";
      this.record(current, "rejected", 409, admission, { reason: message });
      this.saveQuietly();
      fail(409, message);
    }
    const requestId = `wfw:${current.id}:${createHash("sha256").update(deliveryId).digest("hex")}`.slice(0, 200);
    const started = this.engine.start(current.workflowId, {
      version: current.workflowVersion,
      inputs: validated.values,
      triggeredBy: { triggerId: current.id, triggerName: current.name, deliveryId },
      requestId,
    });
    if (!started.ok) {
      if (started.needsInput) {
        const refusal = configurationRefusal(validationIssues(started.needsInput), 422);
        this.record(current, "rejected", 422, admission, { reason: refusal.message });
        this.saveQuietly();
        throw refusal;
      }
      fail(500, started.error);
    }
    this.registerRun(started.run);
    if (this.env.OMB_WORKFLOW_TRIGGER_FAULT === "after-start") {
      fail(500, "injected fault after the run was created (fixture only)");
    }
    const acceptedAt = this.now();
    current.lastReceivedAt = acceptedAt;
    current.lastRunId = started.run.id;
    current.deliveryCount += 1;
    current.updatedAt = acceptedAt;
    this.receipts.push({ triggerId: current.id, deliveryId, runId: started.run.id, acceptedAt });
    this.receiptIndex.set(receiptKey(current.id, deliveryId), started.run.id);
    this.record(current, "accepted", 202, admission, { runId: started.run.id });
    this.saveQuietly();
    return { accepted: true, runId: started.run.id, deliveryId, duplicate: false };
  }

  private admitRate(trigger: StoredTrigger, admission: Admission, now: number): void {
    this.workspaceRate = this.workspaceRate.filter((at) => now - at < RATE_WINDOW_MS);
    if (this.workspaceRate.length >= WORKFLOW_TRIGGER_WORKSPACE_RATE) {
      const message = `this workspace reached ${WORKFLOW_TRIGGER_WORKSPACE_RATE} authenticated webhook deliveries per minute`;
      this.record(trigger, "rejected", 429, admission, { reason: message });
      this.saveQuietly();
      fail(429, message);
    }
    const recent = (this.endpointRate.get(trigger.endpointId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
    if (recent.length >= WORKFLOW_TRIGGER_ENDPOINT_RATE) {
      const message = `this Workflow trigger reached ${WORKFLOW_TRIGGER_ENDPOINT_RATE} deliveries per minute`;
      this.record(trigger, "rejected", 429, admission, { reason: message });
      this.saveQuietly();
      fail(429, message);
    }
    this.workspaceRate.push(now);
    recent.push(now);
    this.endpointRate.set(trigger.endpointId, recent);
  }

  private record(
    trigger: StoredTrigger,
    outcome: WorkflowTriggerAttemptOutcome,
    statusCode: number,
    admission: Partial<Admission>,
    details: { runId?: string; reason?: string },
  ): WorkflowTriggerAttempt {
    const attempt: StoredAttempt = {
      id: randomUUID(),
      triggerId: trigger.id,
      receivedAt: this.now(),
      outcome,
      statusCode,
    };
    if (admission.deliveryId) attempt.deliveryId = admission.deliveryId.slice(0, DELIVERY_ID_MAX);
    if (admission.eventName) attempt.eventName = admission.eventName.slice(0, 200);
    if (details.runId) attempt.runId = details.runId;
    if (details.reason) attempt.reason = details.reason.slice(0, 500);
    this.attempts.push(attempt);
    return { ...attempt };
  }

  /** Anyone who reaches the receiver can send a wrong secret: one rolling record per burst. */
  recordUnauthorized(endpointId: string, event: { deliveryId?: string; eventName?: string } = {}): WorkflowTriggerAttempt | null {
    const trigger = this.triggers.find((candidate) => candidate.endpointId === endpointId);
    if (!trigger) return null;
    const details = (count: number) => ({
      runId: undefined,
      reason: count > 1 ? `${UNAUTHORIZED_REASON} (${count} requests)` : UNAUTHORIZED_REASON,
    });
    const at = this.attempts.findLastIndex((attempt) => attempt.triggerId === trigger.id);
    const burst = at === -1 ? undefined : this.attempts[at]!;
    if (!burst || burst.outcome !== "rejected" || burst.statusCode !== 401 || this.now() - burst.receivedAt > UNAUTHORIZED_BURST_MS) {
      return this.record(trigger, "rejected", 401, event, details(1));
    }
    const count = Number(/\((\d+) requests\)$/.exec(burst.reason ?? "")?.[1] ?? 1) + 1;
    this.attempts.splice(at, 1);
    return this.record(trigger, "rejected", 401, event, details(count));
  }

  private saveQuietly(): void {
    try {
      this.save();
    } catch (error) {
      this.log(`workflow triggers: could not save ${this.file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function validationIssues(failure: {
  missing: Array<{ step: string; name: string; reason?: string }>;
  invalid: Array<{ step: string; name: string; reason?: string }>;
  unknown: string[];
}): WorkflowTriggerIssue[] {
  const issues: WorkflowTriggerIssue[] = [];
  for (const entry of failure.missing) issues.push(issue(`inputs.${entry.name}`, "a required parameter has no value"));
  for (const entry of failure.invalid) issues.push(issue(`inputs.${entry.name}`, entry.reason ?? "the value has the wrong type"));
  for (const name of failure.unknown) issues.push(issue(`inputs.${name}`, "unknown parameter"));
  return issues.length > 0 ? issues : [issue("inputs", "the resolved parameters are invalid")];
}

function reasonMessage(reason: NonNullable<WorkflowTrigger["pausedReason"]>): string {
  switch (reason) {
    case "missing-bot":
      return "This Workflow trigger is paused because a bot its Workflow needs is missing";
    case "missing-workflow":
      return "This Workflow trigger is paused because its Workflow or pinned version is missing";
    case "restored":
      return "This Workflow trigger was restored from a backup and must be re-enabled";
    case "frozen":
      return "This Workflow trigger is paused while the workspace is frozen";
    case "moved":
      return "This Workflow trigger is paused after a move";
    default:
      return "This Workflow trigger is paused";
  }
}

function normalizeHeaderSample(
  value: unknown,
  issues: WorkflowTriggerIssue[],
): Record<string, string | string[] | undefined> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(issue("headers", "headers must be an object"));
    return {};
  }
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "string") headers[name] = entry;
    else if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) headers[name] = entry as string[];
    else issues.push(issue(`headers.${name}`, "a header value must be text or a list of text"));
  }
  return headers;
}

function normalizeQuerySample(
  value: unknown,
  issues: WorkflowTriggerIssue[],
): Record<string, string[]> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(issue("query", "query must be an object"));
    return {};
  }
  const query: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "string") query[name] = [entry];
    else if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) query[name] = entry as string[];
    else issues.push(issue(`query.${name}`, "a query value must be text or a list of text"));
  }
  return query;
}
