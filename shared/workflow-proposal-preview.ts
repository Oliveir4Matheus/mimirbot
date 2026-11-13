// A proposal's preview is a document, not the editor: each step shows what it
// receives, what it does, what it leaves and how that is proved. It is derived
// from the same definition the engine would run, so the preview cannot drift.
import type { WorkflowProposal } from "./workflow-proposal.ts";
import type { WorkflowStep } from "./workflow.ts";

export type ProposalPreviewTag = "bot" | "script" | "condition" | "loop" | "manual";

export interface ProposalPreviewStep {
  id: string;
  name: string;
  tags: ProposalPreviewTag[];
  input: string[];
  process: string;
  output: string[];
  proof: string[];
  /** Present only for a script step. */
  code?: { name: string; content: string };
  /** The annotation the person wrote for this step. */
  note?: string;
}

export interface ProposalPreview {
  title: string;
  department: string;
  version: number;
  steps: ProposalPreviewStep[];
  assumptions: string[];
  /** Non-blocking advice about a script's static surface. */
  scriptWarnings: Array<{ step: string; warning: string }>;
  error?: string;
}

const SCRIPT_WARNINGS: ReadonlyArray<{ pattern: RegExp; warning: string }> = [
  { pattern: /\bchild_process\b|\bexecSync\b|\bspawnSync\b|\bexec\(/, warning: "inicia processos externos" },
  { pattern: /\bnode:(?:net|http|https|tls|dgram)\b|\bfetch\(/, warning: "usa a rede" },
  { pattern: /\bfs\.(?:rm|unlink|rmdir)|\brmSync\(|\bunlinkSync\(/, warning: "apaga arquivos" },
  { pattern: /(?:^|[^.\w])\.\.(?:\/|\\|\b)/, warning: "usa caminho com .." },
];

function conditionText(step: Extract<WorkflowStep, { kind: "condition" }>): string {
  const rows = step.conditions.map((line) => `${line.field} ${line.op}${line.value === undefined ? "" : ` ${JSON.stringify(line.value)}`}`);
  return `${step.match === "any" ? "Qualquer" : "Todas"}: ${rows.join("; ")}`;
}

function inputLines(step: WorkflowStep): string[] {
  if (step.kind === "condition") return [`result.json de ${step.from}`];
  if (step.kind === "loop") return [`corpo de ${step.body.length} etapa(s)`, `condição sobre ${step.from}`];
  const params = (step.parameters ?? []).map((parameter) => `${parameter.name} (${parameter.type})`);
  return [...step.inputs.map((input) => input.as), ...params.map((name) => `params.json · ${name}`)];
}

function proofLines(step: WorkflowStep): string[] {
  if (step.kind === "condition") return ["uma das duas rotas é escolhida"];
  if (step.kind === "loop") {
    return [
      ...step.outputs.map((output) => `${output.path}${output.required ? "" : " (opcional)"}`),
      `até ${step.maxIterations} volta(s); condição satisfeita encerra`,
    ];
  }
  const proof = step.outputs.map((output) => `${output.path}${output.required ? "" : " (opcional)"}`);
  if (step.result) proof.push(`resultado JSON: ${step.result}`);
  if (step.require) proof.push(`require: ${JSON.stringify(step.require)}`);
  return proof;
}

function processLine(step: WorkflowStep): string {
  if (step.kind === "bot") return step.instructions;
  if (step.kind === "script") return `Executa ${step.run}`;
  if (step.kind === "condition") return conditionText(step);
  return `Repete ${step.body.length} etapa(s) até a condição`;
}

export function proposalPreview(proposal: WorkflowProposal): ProposalPreview {
  const steps: ProposalPreviewStep[] = proposal.definition.steps.map((step) => {
    const tags: ProposalPreviewTag[] = [step.kind];
    if ((step.kind === "bot" || step.kind === "script") && step.mode === "manual") tags.push("manual");
    const script = step.kind === "script" ? proposal.scripts.find((entry) => entry.name === step.run) : undefined;
    const warnings = step.kind === "script" && script
      ? SCRIPT_WARNINGS.filter((entry) => entry.pattern.test(script.content)).map((entry) => entry.warning)
      : [];
    return {
      id: step.id,
      name: step.name,
      tags,
      input: inputLines(step),
      process: processLine(step),
      output: step.kind === "condition" ? [] : step.kind === "loop" ? step.outputs.map((output) => output.path) : step.outputs.map((output) => output.path),
      proof: proofLines(step),
      ...(script ? { code: { name: script.name, content: script.content } } : {}),
      ...(proposal.annotations?.[step.id] ? { note: proposal.annotations[step.id] } : {}),
      ...(warnings.length > 0 ? { tags: [...tags, "script"] } : {}),
    };
  });
  return {
    title: proposal.definition.name,
    department: proposal.department,
    version: proposal.definition.version,
    steps,
    assumptions: proposal.assumptions,
    scriptWarnings: proposal.definition.steps.flatMap((step) => {
      if (step.kind !== "script") return [];
      const script = proposal.scripts.find((entry) => entry.name === step.run);
      if (!script) return [];
      return SCRIPT_WARNINGS.filter((entry) => entry.pattern.test(script.content))
        .map((entry) => ({ step: step.name, warning: entry.warning }));
    }),
  };
}
