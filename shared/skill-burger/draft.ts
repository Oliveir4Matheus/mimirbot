// A finished run as a draft workflow. Nobody fills a form: values the person typed in the ask become args (the recorded
// value is the default), and values an earlier step returned are piped from it. Only commands and file writes that were
// recorded exactly are saved; a step that needs an app, the browser, a desktop or a judgement is a reason to refuse.
import { redactSecretsInText } from "../redact.ts";
import { workflowSchema, type Workflow, type WorkflowRef, type WorkflowStep } from "./format.ts";
import { askOf, burgerLayers, type BurgerLayer, type RunMessage } from "./layers.ts";

const PIPE_MIN = 6;
const ARG_MIN = 3;
const SEARCH_BUDGET = 5_000;
const MASKED = /••••••|«redacted \d+ chars»|\[redacted\]|\[(?:additional data|large content|binary content) omitted\]/;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const capital = (words: string) => (words ? words[0]!.toUpperCase() + words.slice(1) : words);

/** The line a layer gets: "Run git push", "Write notes.md", "Send email". */
export function layerLabel(layer: Pick<BurgerLayer, "kind" | "words" | "app">): string {
  switch (layer.kind) {
    case "shell": return `Run ${layer.words}`;
    case "file": return `Write ${layer.words}`;
    case "browser": return `Open ${layer.words}`;
    default: return capital(layer.words);
  }
}

function parsedOutput(layer: BurgerLayer): unknown {
  if (!layer.output) return undefined;
  let value: unknown;
  try { value = JSON.parse(layer.output); } catch { return layer.output; }
  // One tool of a multi-app call answers in its own slot of the shared result.
  const index = /#(\d+)$/.exec(layer.id)?.[1];
  const results = isRecord(value) && isRecord(value.data) && Array.isArray(value.data.results) ? value.data.results : undefined;
  return index !== undefined && results ? results[Number(index)] : value;
}

/** Where `target` sits in `value`, as a dotted path; "" for the value itself. */
function findPath(value: unknown, target: string): string | null {
  let budget = SEARCH_BUDGET;
  const walk = (node: unknown, path: string[], depth: number): string | null => {
    if (--budget < 0 || depth > 8) return null;
    if (typeof node === "string") return node === target ? path.join(".") : null;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) { const hit = walk(node[i], [...path, String(i)], depth + 1); if (hit !== null) return hit; }
    } else if (isRecord(node)) {
      for (const [key, child] of Object.entries(node)) { const hit = walk(child, [...path, key], depth + 1); if (hit !== null) return hit; }
    }
    return null;
  };
  return walk(value, [], 0);
}

function argName(key: string | undefined, taken: Record<string, unknown>): string {
  const stem = (key ?? "value").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "").replace(/_(?:email|emails|address|addresses)$/, "").slice(0, 32) || "value";
  if (!(stem in taken)) return stem;
  for (let n = 2; ; n += 1) if (!(`${stem}_${n}` in taken)) return `${stem}_${n}`;
}

interface Recorded { id: string; output: unknown }

class Drafter {
  readonly args: Workflow["args"] = {};
  readonly steps: WorkflowStep[] = [];
  private readonly recorded: Recorded[] = [];
  private readonly ask: string;

  constructor(ask: string) {
    this.ask = ask.toLowerCase();
  }

  private inAsk(value: string): boolean {
    return value.length >= ARG_MIN && !/^\d{1,2}$/.test(value) && this.ask.includes(value.toLowerCase());
  }

  private pipe(value: string): WorkflowRef | null {
    if (value.length < PIPE_MIN) return null;
    for (let i = this.recorded.length - 1; i >= 0; i -= 1) {
      const path = findPath(this.recorded[i]!.output, value);
      if (path !== null) return { $step: this.recorded[i]!.id, ...(path ? { path } : {}) };
    }
    return null;
  }

  private value(value: string): string | WorkflowRef {
    return this.pipe(value) ?? value;
  }

  /** Words the person typed that the command repeats become OMB_ARG_<NAME>, where the shell would expand them. */
  private shell(run: string): string {
    const words = [...new Set(run.split(/\s+/).slice(1).map((word) => word.replace(/^["'`]+|["'`;,)]+$/g, "")).filter((word) => !word.startsWith("-") && this.inAsk(word)))];
    let out = run;
    for (const word of words) {
      const flag = /(?:^|\s)--?([a-z][a-z0-9-]*)[\s=]+["']?$/i.exec(out.slice(0, Math.max(0, out.indexOf(word))))?.[1]?.replace(/-/g, "_");
      const name = Object.entries(this.args).find(([, arg]) => arg.default === word)?.[0] ?? argName(flag, this.args);
      const env = `$OMB_ARG_${name.toUpperCase()}`;
      let quote: string | null = null;
      let rebuilt = "";
      for (let i = 0; i < out.length; i += 1) {
        const char = out[i]!;
        if (out.startsWith(word, i) && quote !== "'" && !/[\w./-]/.test(out[i - 1] ?? " ") && !/[\w./-]/.test(out[i + word.length] ?? " ")) {
          rebuilt += quote === '"' ? env : `"${env}"`;
          i += word.length - 1;
          continue;
        }
        if ((char === "'" || char === '"') && (quote === null || quote === char)) quote = quote ? null : char;
        rebuilt += char;
      }
      if (rebuilt === out) continue;
      if (!(name in this.args)) this.args[name] = { default: word, ...(flag ? { label: flag.replace(/_/g, " ") } : {}) };
      out = rebuilt;
    }
    return out;
  }

  /** Returns why this layer can't be saved, or null when it can. */
  add(layer: BurgerLayer, index: number): string | null {
    const id = `s${index + 1}`;
    const label = layerLabel(layer).slice(0, 120);
    const raw = layer.args === undefined ? "" : JSON.stringify(layer.args);
    if (raw && (MASKED.test(raw) || redactSecretsInText(raw) !== raw)) {
      return `"${label}" used a secret, so it isn't saved.`;
    }
    if (layer.kind === "shell") {
      this.steps.push({ id, kind: "shell", label, run: this.shell(String(layer.args?.command ?? "")), ...(typeof layer.args?.cwd === "string" ? { cwd: layer.args.cwd } : {}) });
    } else if (layer.kind === "file") {
      this.steps.push({ id, kind: "file", label, path: String(layer.args?.path ?? ""), content: this.value(String(layer.args?.content ?? "")) });
    } else {
      return `"${label}" changed an app, a page or a computer screen, and this version repeats only commands and file writes.`;
    }
    this.recorded.push({ id, output: parsedOutput(layer) });
    return null;
  }
}

export interface WorkflowDraft { workflow: Workflow; layers: BurgerLayer[] }
export type DraftResult = WorkflowDraft | { reason: string };

/** The run since the person's last ask as a workflow, or why it can't be saved. */
export function draftWorkflow(messages: readonly RunMessage[], options: { summary?: string } = {}): DraftResult {
  const layers = burgerLayers(messages).filter((layer) => layer.status === "done");
  if (layers.length < 2) return { reason: "This run has fewer than two steps that can run again." };
  const ask = askOf(messages) ?? "";
  const summary = (options.summary?.trim() || ask || layers.map(layerLabel).join(", ")).replace(/\s+/g, " ").slice(0, 160);
  if (!summary) return { reason: "This run has no summary to name it by." };
  const drafter = new Drafter(ask);
  for (const [index, layer] of layers.entries()) {
    const refusal = drafter.add(layer, index);
    if (refusal) return { reason: refusal };
  }
  const workflow = workflowSchema.safeParse({
    version: 1,
    summary: redactSecretsInText(summary),
    args: JSON.parse(redactSecretsInText(JSON.stringify(drafter.args))) as Workflow["args"],
    steps: JSON.parse(redactSecretsInText(JSON.stringify(drafter.steps))) as WorkflowStep[],
  });
  if (!workflow.success) return { reason: "This run can't be saved as a skill." };
  return { workflow: workflow.data, layers };
}
