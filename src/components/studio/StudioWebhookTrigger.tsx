import { Copy, Eye, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkflowParameter, WorkflowParameterType } from "../../../shared/workflow";
import type {
  WorkflowInputBinding,
  WorkflowTrigger,
  WorkflowTriggerCredential,
  WorkflowTriggerPreview,
} from "../../../shared/workflow-trigger";
import type { LocaleKey } from "@/locales";
import { t } from "@/lib/i18n";
import { ApiError } from "@/state/api";
import {
  bindingFor,
  createWorkflowTrigger,
  listWorkflowTriggers,
  previewWorkflowTrigger,
  rotateWorkflowTriggerSecret,
  updateWorkflowTrigger,
  type WorkflowTriggerPreviewSample,
} from "@/lib/workflows-api";

type BindingSource = "none" | "payload" | "header" | "query" | "constant";

interface BindingForm {
  source: BindingSource;
  pointer: string;
  name: string;
  value: string;
  onMissing: "reject" | "omit";
}

const SOURCES: BindingSource[] = ["none", "payload", "header", "query", "constant"];

const SOURCE_LABEL: Record<BindingSource, LocaleKey> = {
  none: "studio.trigger.wfw.source.none",
  payload: "studio.trigger.wfw.source.payload",
  header: "studio.trigger.wfw.source.header",
  query: "studio.trigger.wfw.source.query",
  constant: "studio.trigger.wfw.source.constant",
};

const TEXT_TYPES: ReadonlySet<WorkflowParameterType> = new Set(["string", "date", "enum"]);

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

function defaultBinding(parameter: WorkflowParameter): BindingForm {
  return {
    source: parameter.required ? "payload" : "none",
    pointer: "",
    name: parameter.name,
    value: "",
    onMissing: parameter.required ? "reject" : "omit",
  };
}

function bindingToForm(binding: WorkflowInputBinding, parameter: WorkflowParameter): BindingForm {
  const base = defaultBinding(parameter);
  if (binding === null) return { ...base, source: "none" };
  if (binding.source === "constant") {
    return { ...base, source: "constant", value: typeof binding.value === "string" ? binding.value : JSON.stringify(binding.value) };
  }
  if (binding.source === "payload") {
    return { ...base, source: "payload", pointer: binding.pointer, onMissing: binding.onMissing ?? base.onMissing };
  }
  return {
    ...base,
    source: binding.source,
    name: binding.name,
    onMissing: binding.onMissing ?? base.onMissing,
  };
}

function constantValue(text: string, parameter: WorkflowParameter): string | number | boolean | Array<string | number | boolean> {
  const trimmed = text.trim();
  if (parameter.list) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error(t("studio.trigger.wfw.listNeedsArray"));
    return parsed as Array<string | number | boolean>;
  }
  if (parameter.type === "number" || parameter.type === "integer") {
    const value = Number(trimmed);
    if (!trimmed || !Number.isFinite(value)) throw new Error(t("studio.trigger.wfw.numberNeedsNumber"));
    return value;
  }
  if (parameter.type === "boolean") {
    if (trimmed !== "true" && trimmed !== "false") throw new Error(t("studio.trigger.wfw.booleanNeedsBoolean"));
    return trimmed === "true";
  }
  return text;
}

function formBinding(form: BindingForm, parameter: WorkflowParameter): WorkflowInputBinding {
  if (form.source === "none") return null;
  if (form.source === "payload") {
    return { source: "payload", pointer: form.pointer, ...(parameter.required ? {} : { onMissing: form.onMissing }) };
  }
  if (form.source === "header") {
    return { source: "header", name: form.name.trim(), ...(parameter.required ? {} : { onMissing: form.onMissing }) };
  }
  if (form.source === "query") {
    return { source: "query", name: form.name.trim(), ...(parameter.required ? {} : { onMissing: form.onMissing }) };
  }
  return { source: "constant", value: constantValue(form.value, parameter) };
}

function parseJsonObject(text: string): Record<string, string | string[]> {
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("studio.trigger.wfw.badJson"));
  const result: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string") result[name] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[name] = value as string[];
    else throw new Error(t("studio.trigger.wfw.badJson"));
  }
  return result;
}

function triggerMatches(trigger: WorkflowTrigger, nodeId: string, triggerId: string | undefined): boolean {
  return trigger.nodeId === nodeId || (triggerId !== undefined && trigger.id === triggerId);
}

export function StudioWebhookTrigger({ workflowId, workflowVersion, nodeId, nodeName, triggerId, parameters, onRuntime, onClose }: {
  workflowId?: string;
  workflowVersion?: number;
  nodeId: string;
  nodeName: string;
  triggerId?: string;
  parameters: WorkflowParameter[];
  onRuntime: (trigger: WorkflowTrigger | null) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<WorkflowTrigger | null>(null);
  const [name, setName] = useState(nodeName);
  const [version, setVersion] = useState(workflowVersion ?? 1);
  const [eventTypes, setEventTypes] = useState("");
  const [maxPending, setMaxPending] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [bindings, setBindings] = useState<Record<string, BindingForm>>(() => Object.fromEntries(parameters.map((parameter) => [parameter.name, defaultBinding(parameter)])));
  const [credential, setCredential] = useState<WorkflowTriggerCredential | null>(null);
  const [copied, setCopied] = useState(false);
  const [payloadText, setPayloadText] = useState("{}");
  const [headersText, setHeadersText] = useState("{}");
  const [queryText, setQueryText] = useState("{}");
  const [preview, setPreview] = useState<WorkflowTriggerPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const onRuntimeRef = useRef(onRuntime);
  onRuntimeRef.current = onRuntime;
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  const applyTrigger = useCallback((trigger: WorkflowTrigger) => {
    setCurrent(trigger);
    setName(trigger.name);
    setVersion(trigger.workflowVersion);
    setEventTypes((trigger.eventTypes ?? []).join(", "));
    setMaxPending(trigger.maxPendingRuns === undefined ? "" : String(trigger.maxPendingRuns));
    setEnabled(trigger.enabled);
    const list = parametersRef.current;
    setBindings(Object.fromEntries(list.map((parameter) => [parameter.name, bindingToForm(bindingFor(trigger.inputs, parameter.name), parameter)])));
    onRuntimeRef.current(trigger);
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    listWorkflowTriggers(workflowId)
      .then((list) => {
        if (!alive) return;
        const found = list.find((trigger) => triggerMatches(trigger, nodeId, triggerId));
        if (found) applyTrigger(found);
        else onRuntimeRef.current(null);
      })
      .catch((cause) => { if (alive) setError(message(cause)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workflowId, nodeId, triggerId, applyTrigger]);

  const sourcesFor = useCallback((parameter: WorkflowParameter): BindingSource[] => {
    const text = !parameter.list && TEXT_TYPES.has(parameter.type);
    return SOURCES.filter((source) => text || (source !== "header" && source !== "query"));
  }, []);

  const setBinding = (parameter: string, patch: Partial<BindingForm>): void => {
    setBindings((current) => ({ ...current, [parameter]: { ...current[parameter]!, ...patch } }));
  };

  const save = async (): Promise<void> => {
    if (!workflowId || !workflowVersion) {
      setError(t("studio.trigger.wfw.saveFirst"));
      return;
    }
    setSaving(true);
    setError(null);
    setPreview(null);
    setPreviewError(null);
    try {
      const inputs: Record<string, WorkflowInputBinding> = {};
      for (const parameter of parameters) {
        inputs[parameter.name] = formBinding(bindings[parameter.name] ?? defaultBinding(parameter), parameter);
      }
      const types = eventTypes.split(",").map((value) => value.trim()).filter(Boolean);
      const pending = maxPending.trim() === "" ? undefined : Number(maxPending);
      if (pending !== undefined && (!Number.isSafeInteger(pending) || pending < 1 || pending > 50)) {
        throw new Error(t("studio.trigger.wfw.pendingRange"));
      }
      if (current) {
        const updated = await updateWorkflowTrigger(workflowId, current.id, {
          name: name.trim(),
          workflowVersion: version,
          inputs,
          eventTypes: types,
          enabled,
          maxPendingRuns: pending ?? null,
        });
        applyTrigger(updated);
      } else {
        const created = await createWorkflowTrigger(workflowId, {
          name: name.trim(),
          workflowVersion: version,
          inputs,
          ...(types.length > 0 ? { eventTypes: types } : {}),
          enabled,
          ...(pending === undefined ? {} : { maxPendingRuns: pending }),
          nodeId,
        });
        applyTrigger(created.trigger);
        setCredential(created.credential);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (): Promise<void> => {
    if (!workflowId || !current) return;
    setSaving(true);
    setError(null);
    try {
      setCredential(await rotateWorkflowTriggerSecret(workflowId, current.id));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async (): Promise<void> => {
    if (!workflowId || !current) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const payload: unknown = payloadText.trim() ? JSON.parse(payloadText) : {};
      const sample: WorkflowTriggerPreviewSample = {
        payload,
        headers: parseJsonObject(headersText),
        query: parseJsonObject(queryText),
      };
      setPreview(await previewWorkflowTrigger(workflowId, current.id, sample));
    } catch (cause) {
      if (cause instanceof ApiError) {
        const body = cause.body as { issues?: Array<{ path: string; message: string }> } | undefined;
        setPreviewError(body?.issues?.map((entry) => `${entry.path}: ${entry.message}`).join(" · ") ?? message(cause));
      } else {
        setPreviewError(message(cause));
      }
    } finally {
      setPreviewing(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const stale = current !== null && workflowVersion !== undefined && current.workflowVersion !== workflowVersion;
  const resolvedText = useMemo(() => preview ? JSON.stringify(preview.resolvedInputs, null, 2) : "", [preview]);

  if (!workflowId || !workflowVersion) {
    return (
      <div className="studio-wfw-panel">
        <p className="studio-trigger-hint">{t("studio.trigger.wfw.saveFirst")}</p>
        <button type="button" className="studio-wfw-button" onClick={onClose}>{t("studio.balloon.close")}</button>
      </div>
    );
  }

  return (
    <div className="studio-wfw-panel">
      {loading && <p className="studio-trigger-hint"><Loader2 size={12} className="studio-wfw-spin" aria-hidden="true" /> {t("studio.trigger.wfw.loading")}</p>}
      {stale && current && <p className="studio-wfw-stale">{t("studio.trigger.wfw.stale", { version: current.workflowVersion, current: workflowVersion })}</p>}

      <div className="studio-wfw-grid">
        <label className="studio-field">
          <span className="studio-label">{t("studio.trigger.wfw.version")}</span>
          <input
            className="studio-input"
            type="number"
            min={1}
            value={version}
            onChange={(event) => setVersion(Number(event.target.value))}
          />
        </label>
        <label className="studio-field">
          <span className="studio-label">{t("studio.trigger.wfw.maxPending")}</span>
          <input
            className="studio-input"
            type="number"
            min={1}
            max={50}
            placeholder="3"
            value={maxPending}
            onChange={(event) => setMaxPending(event.target.value)}
          />
        </label>
      </div>
      <label className="studio-field">
        <span className="studio-label">{t("studio.trigger.wfw.eventTypes")}</span>
        <input
          className="studio-input"
          placeholder="order.paid, order.refunded"
          value={eventTypes}
          onChange={(event) => setEventTypes(event.target.value)}
        />
        <span className="studio-trigger-hint">{t("studio.trigger.wfw.eventTypesHint")}</span>
      </label>
      <label className="studio-wfw-check">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        {t("studio.trigger.wfw.enabled")}
      </label>

      <div className="studio-wfw-section">
        <span className="studio-label">{t("studio.trigger.wfw.parameters")}</span>
        {parameters.length === 0 && <p className="studio-trigger-hint">{t("studio.trigger.wfw.noParameters")}</p>}
        {parameters.map((parameter) => {
          const form = bindings[parameter.name] ?? defaultBinding(parameter);
          return (
            <div className="studio-wfw-binding" key={parameter.name}>
              <div className="studio-wfw-binding-head">
                <code>{parameter.name}</code>
                <span>{parameter.type}{parameter.list ? "[]" : ""} · {parameter.required ? t("studio.trigger.wfw.required") : t("studio.trigger.wfw.optional")}</span>
              </div>
              <div className="studio-wfw-grid">
                <label className="studio-field">
                  <span className="studio-label">{t("studio.trigger.wfw.source")}</span>
                  <select
                    className="studio-input"
                    value={form.source}
                    onChange={(event) => setBinding(parameter.name, { source: event.target.value as BindingSource })}
                  >
                    {sourcesFor(parameter).map((source) => <option key={source} value={source}>{t(SOURCE_LABEL[source])}</option>)}
                  </select>
                </label>
                {!parameter.required && form.source !== "none" && form.source !== "constant" && (
                  <label className="studio-field">
                    <span className="studio-label">{t("studio.trigger.wfw.missing")}</span>
                    <select
                      className="studio-input"
                      value={form.onMissing}
                      onChange={(event) => setBinding(parameter.name, { onMissing: event.target.value as "reject" | "omit" })}
                    >
                      <option value="reject">{t("studio.trigger.wfw.missing.reject")}</option>
                      <option value="omit">{t("studio.trigger.wfw.missing.omit")}</option>
                    </select>
                  </label>
                )}
              </div>
              {form.source === "payload" && (
                <label className="studio-field">
                  <span className="studio-label">{t("studio.trigger.wfw.pointer")}</span>
                  <input
                    className="studio-input"
                    placeholder="/data/customer/id"
                    value={form.pointer}
                    onChange={(event) => setBinding(parameter.name, { pointer: event.target.value })}
                  />
                  <span className="studio-trigger-hint">{t("studio.trigger.wfw.pointerHint")}</span>
                </label>
              )}
              {(form.source === "header" || form.source === "query") && (
                <label className="studio-field">
                  <span className="studio-label">{t("studio.trigger.wfw.name")}</span>
                  <input
                    className="studio-input"
                    placeholder={form.source === "header" ? "x-sent-at" : "customer_id"}
                    value={form.name}
                    onChange={(event) => setBinding(parameter.name, { name: event.target.value })}
                  />
                </label>
              )}
              {form.source === "constant" && (
                <label className="studio-field">
                  <span className="studio-label">{t("studio.trigger.wfw.constant")}</span>
                  <input
                    className="studio-input"
                    value={form.value}
                    onChange={(event) => setBinding(parameter.name, { value: event.target.value })}
                  />
                </label>
              )}
              {form.source === "none" && <p className="studio-trigger-hint">{t("studio.trigger.wfw.omittedHint")}</p>}
            </div>
          );
        })}
      </div>

      <div className="studio-wfw-actions">
        <button type="button" className="studio-wfw-button studio-wfw-primary" disabled={saving} onClick={() => { void save(); }}>
          {saving ? t("studio.trigger.wfw.saving") : t("studio.trigger.wfw.save")}
        </button>
        {current && (
          <button type="button" className="studio-wfw-button" disabled={saving} onClick={() => { void rotate(); }}>
            <RefreshCw size={12} aria-hidden="true" /> {t("studio.trigger.wfw.rotate")}
          </button>
        )}
      </div>

      {error && <p className="studio-wfw-error" role="alert">{error}</p>}

      {credential && (
        <div className="studio-wfw-credential" role="status">
          <span className="studio-label"><ShieldCheck size={12} aria-hidden="true" /> {t("studio.trigger.wfw.credential")}</span>
          <code>{credential.url}</code>
          <div className="studio-wfw-actions">
            <button type="button" className="studio-wfw-button" onClick={() => { void copy(); }}>
              <Copy size={12} aria-hidden="true" /> {copied ? t("studio.trigger.wfw.copied") : t("studio.trigger.wfw.copy")}
            </button>
          </div>
          <p className="studio-trigger-hint">{t("studio.trigger.wfw.credentialHint")}</p>
        </div>
      )}

      <div className="studio-wfw-section">
        <span className="studio-label"><Eye size={12} aria-hidden="true" /> {t("studio.trigger.wfw.preview")}</span>
        <label className="studio-field">
          <span className="studio-label">{t("studio.trigger.wfw.previewPayload")}</span>
          <textarea className="studio-input studio-wfw-json" rows={4} value={payloadText} onChange={(event) => setPayloadText(event.target.value)} />
        </label>
        <div className="studio-wfw-grid">
          <label className="studio-field">
            <span className="studio-label">{t("studio.trigger.wfw.previewHeaders")}</span>
            <textarea className="studio-input studio-wfw-json" rows={2} value={headersText} onChange={(event) => setHeadersText(event.target.value)} />
          </label>
          <label className="studio-field">
            <span className="studio-label">{t("studio.trigger.wfw.previewQuery")}</span>
            <textarea className="studio-input studio-wfw-json" rows={2} value={queryText} onChange={(event) => setQueryText(event.target.value)} />
          </label>
        </div>
        <button type="button" className="studio-wfw-button" disabled={!current || previewing} onClick={() => { void runPreview(); }}>
          {previewing ? t("studio.trigger.wfw.previewing") : t("studio.trigger.wfw.previewAction")}
        </button>
        {previewError && <p className="studio-wfw-error" role="alert">{t("studio.trigger.wfw.previewError")} {previewError}</p>}
        {preview && (
          <div className="studio-wfw-preview">
            <span className="studio-label">{t("studio.trigger.wfw.resolved")}</span>
            <pre>{resolvedText}</pre>
            <p className="studio-trigger-hint">
              {preview.omitted.length === 0
                ? t("studio.trigger.wfw.noOmitted")
                : t("studio.trigger.wfw.omitted", { names: preview.omitted.join(", ") })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
