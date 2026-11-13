import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, Loader2, Play, RotateCcw, Terminal, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/cn";
import { copyText } from "@/lib/copy-text";
import { useStore } from "@/state/store";
import { useDesktopCapabilities } from "./DesktopCapabilities";

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface Step {
  id: string;
  title: string;
  description: string;
  method: Method;
  /** `:id` and `:runId` come from the answers of the earlier steps. */
  path: string;
  editable?: boolean;
  /** A test the person runs on purpose; "Executar tudo" leaves it alone. */
  manual?: boolean;
}

interface Outcome {
  stepId: string;
  method: Method;
  path: string;
  status: number;
  ok: boolean;
  ms: number;
  at: number;
  requestBody?: string;
  response: unknown;
  error?: string;
}

const STEPS: readonly Step[] = [
  { id: "list", title: "Listar Workflows", description: "Antes de criar: a lista começa vazia.", method: "GET", path: "/api/workflows" },
  { id: "create", title: "Criar o Workflow de exemplo", description: "Duas etapas com o primeiro bot do app. O corpo é editável; o id é um UUID.", method: "POST", path: "/api/workflows", editable: true },
  { id: "list-after", title: "Listar de novo", description: "O Workflow criado agora aparece com version 1.", method: "GET", path: "/api/workflows" },
  { id: "read", title: "Ler o Workflow", description: "Retorna a versão atual e todas as versões.", method: "GET", path: "/api/workflows/:id" },
  { id: "update", title: "Salvar uma mudança", description: "Muda o nome; o servidor sobe a versão para 2. O corpo vem da última leitura.", method: "PUT", path: "/api/workflows/:id", editable: true },
  { id: "run", title: "Iniciar uma run", description: "Responde 202 com run.id. Opcional: {\"version\": 1} para rodar uma versão específica.", method: "POST", path: "/api/workflows/:id/run", editable: true },
  { id: "runs", title: "Listar runs", description: "A run nova aparece aqui, com status e etapa atual.", method: "GET", path: "/api/workflows/runs" },
  { id: "status", title: "Ver a run", description: "Etapa atual, status de cada etapa, arquivos verificados e motivo de falha. Execute de novo para atualizar.", method: "GET", path: "/api/workflows/runs/:runId" },
  { id: "guard", title: "Tentar apagar o Workflow com a run ativa", description: "Espera 409 enquanto houver run queued/running/waiting_approval. Se a run já terminou, este passo apaga o Workflow — reinicie depois.", method: "DELETE", path: "/api/workflows/:id", manual: true },
  { id: "cancel", title: "Cancelar a run", description: "Se a run ainda estiver rodando, cancela e interrompe o turno. Se já terminou, 409 é a resposta correta.", method: "POST", path: "/api/workflows/runs/:runId/cancel", editable: true },
  { id: "delete-run", title: "Apagar a run", description: "Só funciona quando a run não está mais ativa. Recusa com 409 enquanto estiver rodando.", method: "DELETE", path: "/api/workflows/runs/:runId" },
  { id: "delete", title: "Remover o Workflow", description: "Recusa com 409 se ainda houver run ativa. As runs antigas continuam no disco.", method: "DELETE", path: "/api/workflows/:id" },
  { id: "list-final", title: "Listar no fim", description: "Confirma que o Workflow saiu da lista.", method: "GET", path: "/api/workflows" },
];

const METHOD_TONE: Record<Method, string> = {
  GET: "bg-accent/12 text-accent-text",
  POST: "bg-success/12 text-success",
  PUT: "bg-warning/12 text-warning",
  DELETE: "bg-danger/12 text-danger",
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

const pretty = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

function demoDefinition(botId: string, department: string): string {
  return JSON.stringify({
    id: "11111111-2222-4333-8444-555555555555",
    version: 1,
    name: "Console demo",
    department,
    steps: [
      {
        id: "coletar",
        name: "Coletar números",
        botId,
        instructions: "Escreva output/numbers.csv com alguns números.",
        outputs: [{ path: "numbers.csv" }],
      },
      {
        id: "revisar",
        name: "Revisar números",
        botId,
        instructions: "Leia input/numbers.csv e escreva output/decision.json com {\"ok\":true}.",
        inputs: [{ as: "numbers.csv", from: { step: "coletar", output: "numbers.csv" } }],
        outputs: [{ path: "decision.json" }],
        result: "decision.json",
        require: { ok: true },
      },
    ],
  }, null, 2);
}

function initialBodies(botId: string, department: string): Record<string, string> {
  const create = demoDefinition(botId || "COLE_O_BOT_ID", department);
  const parsed = JSON.parse(create) as Record<string, unknown>;
  parsed.name = "Console demo (v2)";
  return {
    create,
    update: JSON.stringify(parsed, null, 2),
    run: JSON.stringify({}, null, 2),
    cancel: JSON.stringify({ reason: "teste do console" }, null, 2),
  };
}

function statusTone(status: number | "running" | "error" | undefined): string {
  if (status === "running") return "bg-raised text-ink-secondary";
  if (status === "error") return "bg-danger/12 text-danger";
  if (status === undefined) return "bg-raised text-ink-tertiary";
  if (status >= 200 && status < 300) return "bg-success/12 text-success";
  if (status >= 400 && status < 500) return "bg-warning/12 text-warning";
  return "bg-danger/12 text-danger";
}

export function WorkflowConsolePage({ onBack }: { onBack?: () => void } = {}) {
  const { state } = useStore();
  const { capabilities } = useDesktopCapabilities();
  const macInset = capabilities.windowChrome === "mac-inset";
  const dragStyle = macInset ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined;
  const noDragStyle = macInset ? ({ WebkitAppRegion: "no-drag" } as CSSProperties) : undefined;

  const firstBot = useMemo(() => state.bots.find((bot) => !bot.hidden), [state.bots]);
  const botId = firstBot?.id ?? "";
  const department = firstBot?.section?.trim() || "General";

  const [bodies, setBodies] = useState<Record<string, string>>(() => initialBodies(botId, department));
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;

  const [workflowId, setWorkflowId] = useState<string>();
  const [runId, setRunId] = useState<string>();
  const workflowIdRef = useRef<string | undefined>(undefined);
  const runIdRef = useRef<string | undefined>(undefined);

  const [statuses, setStatuses] = useState<Record<string, number | "running" | "error">>({});
  const [history, setHistory] = useState<Outcome[]>([]);
  const [last, setLast] = useState<Outcome>();
  const [runningAll, setRunningAll] = useState(false);
  const [copied, setCopied] = useState<string>();

  useEffect(() => {
    if (!botId) return;
    setBodies((prev) => prev.create.includes("COLE_O_BOT_ID") ? { ...prev, create: initialBodies(botId, department).create } : prev);
  }, [botId, department]);

  const resolvePath = useCallback((template: string) => template
    .replace(":id", workflowIdRef.current ?? ":id")
    .replace(":runId", runIdRef.current ?? ":runId"), []);

  const missing = useCallback((template: string) => (template.includes(":id") && !workflowIdRef.current)
    || (template.includes(":runId") && !runIdRef.current), []);

  const absorb = useCallback((payload: unknown) => {
    if (!isRecord(payload)) return;
    if (isRecord(payload.workflow) && typeof payload.workflow.id === "string") {
      workflowIdRef.current = payload.workflow.id;
      setWorkflowId(payload.workflow.id);
      const next = { ...payload.workflow, name: `${String(payload.workflow.name ?? "Console demo")} (v2)` };
      setBodies((prev) => ({ ...prev, update: pretty(next) }));
    }
    if (isRecord(payload.run) && typeof payload.run.id === "string") {
      runIdRef.current = payload.run.id;
      setRunId(payload.run.id);
    }
    if (Array.isArray(payload.runs) && !runIdRef.current) {
      const first = payload.runs.find(isRecord);
      if (first && typeof first.id === "string") {
        runIdRef.current = first.id;
        setRunId(first.id);
      }
    }
  }, []);

  const runStep = useCallback(async (step: Step): Promise<Outcome> => {
    const path = resolvePath(step.path);
    const body = bodiesRef.current[step.id];
    setStatuses((prev) => ({ ...prev, [step.id]: "running" }));
    const startedAt = performance.now();
    let status = 0;
    let response: unknown = null;
    let error: string | undefined;
    try {
      const res = await fetch(path, {
        method: step.method,
        ...(step.method === "GET" || step.method === "DELETE" ? {} : {
          headers: { "content-type": "application/json" },
          body: body || "{}",
        }),
      });
      status = res.status;
      const text = await res.text();
      try {
        response = text ? JSON.parse(text) : null;
      } catch {
        response = text;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const outcome: Outcome = {
      stepId: step.id,
      method: step.method,
      path,
      status,
      ok: error === undefined && status >= 200 && status < 300,
      ms: Math.round(performance.now() - startedAt),
      at: Date.now(),
      ...(step.method === "GET" || step.method === "DELETE" ? {} : { requestBody: body || "{}" }),
      response,
      ...(error === undefined ? {} : { error }),
    };
    setStatuses((prev) => ({ ...prev, [step.id]: outcome.error ? "error" : outcome.status || "error" }));
    setHistory((prev) => [outcome, ...prev].slice(0, 30));
    setLast(outcome);
    if (outcome.ok) absorb(response);
    return outcome;
  }, [absorb, resolvePath]);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    try {
      for (const step of STEPS) {
        if (step.manual || missing(step.path)) continue;
        await runStep(step);
        if (step.id === "run") await new Promise((resolve) => setTimeout(resolve, 1_200));
      }
    } finally {
      setRunningAll(false);
    }
  }, [missing, runStep]);

  const reset = () => {
    workflowIdRef.current = undefined;
    runIdRef.current = undefined;
    setWorkflowId(undefined);
    setRunId(undefined);
    setStatuses({});
    setHistory([]);
    setLast(undefined);
    setBodies(initialBodies(botId, department));
  };

  const curlFor = (step: Step): string => {
    const url = `${window.location.origin}${resolvePath(step.path)}`;
    const parts = [`curl -s -X ${step.method} '${url}'`];
    if (step.method !== "GET" && step.method !== "DELETE") {
      parts.push("-H 'content-type: application/json'", `--data-binary '${(bodies[step.id] || "{}").replaceAll("'", "'\\''")}'`);
    }
    return parts.join(" ");
  };

  const copy = async (text: string, id: string) => {
    if ((await copyText(text)) !== "copied") return;
    setCopied(id);
    setTimeout(() => setCopied((current) => current === id ? undefined : current), 1_500);
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-app animate-workspace-in">
      <header className="shrink-0 border-b border-hairline/35 bg-app py-3 pl-12 pr-4 md:pl-4" style={dragStyle}>
        <div className="flex flex-wrap items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-ink-secondary hover:bg-raised hover:text-ink"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Voltar
            </button>
          )}
          <Terminal size={18} className="text-accent-text" />
          <h1 className="text-[18px] font-semibold tracking-tight text-ink">Workflow · Console de rotas</h1>
          <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-secondary">ferramenta de teste</span>
          <div className="ml-auto flex items-center gap-2" style={noDragStyle}>
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={runningAll}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {runningAll ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Executar tudo
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg bg-control px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-raised-hover"
            >
              <RotateCcw size={14} />
              Reiniciar
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
          <span>Execute os passos na ordem. Cada resposta aparece à direita, em JSON.</span>
          <span className="text-ink-tertiary">Workflow: <code className="text-ink">{workflowId ?? "—"}</code></span>
          <span className="text-ink-tertiary">Run: <code className="text-ink">{runId ?? "—"}</code></span>
          {!firstBot && <span className="text-warning">Nenhum bot visível: edite o botId no passo 2.</span>}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <section aria-label="Passos" className="min-h-0 overflow-auto border-b border-hairline px-4 py-4 lg:border-b-0 lg:border-r">
          {STEPS.map((step, index) => {
            const stateForStep = statuses[step.id];
            const blocked = missing(step.path);
            const running = stateForStep === "running";
            const number = index + 1;
            return (
              <article key={step.id} className={cn("mb-3 rounded-xl border border-hairline bg-card p-4", blocked && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-ink-secondary">{number}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide", METHOD_TONE[step.method])}>{step.method}</span>
                  <code className="min-w-0 break-all text-[12px] text-ink">{resolvePath(step.path)}</code>
                  {step.manual && <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold text-ink-tertiary">manual</span>}
                  <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums", statusTone(stateForStep))}>
                    {running ? "executando" : stateForStep === undefined ? "—" : stateForStep === "error" ? "erro" : String(stateForStep)}
                  </span>
                </div>
                <h2 className="mt-2 text-[13.5px] font-medium text-ink">{step.title}</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{step.description}</p>
                {step.editable && (
                  <textarea
                    aria-label={`Corpo do passo ${number}`}
                    value={bodies[step.id] ?? ""}
                    onChange={(event) => setBodies((prev) => ({ ...prev, [step.id]: event.target.value }))}
                    spellCheck={false}
                    rows={Math.min(14, Math.max(4, (bodies[step.id] ?? "").split("\n").length + 1))}
                    className="mt-3 w-full resize-y rounded-lg border border-hairline bg-app p-2.5 font-mono text-[11.5px] leading-relaxed text-ink outline-none focus:border-accent"
                  />
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runStep(step)}
                    disabled={blocked || running}
                    className="flex items-center gap-1.5 rounded-lg bg-control px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-raised-hover disabled:opacity-50"
                  >
                    {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Executar
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy(curlFor(step), step.id)}
                    disabled={blocked}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-50"
                  >
                    {copied === step.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                    {copied === step.id ? "Copiado" : "Copiar curl"}
                  </button>
                  {blocked && <span className="text-[11.5px] text-warning">Execute o passo anterior para preencher o id.</span>}
                </div>
              </article>
            );
          })}
          <p className="mb-4 rounded-xl border border-dashed border-hairline p-3 text-[11.5px] leading-relaxed text-ink-tertiary">
            As rotas <code>/api/internal/workflows…</code> são as que as tools dos bots chamam. Elas exigem o bearer da capability do turno,
            então não são chamáveis desta página; use <code>list_workflows</code>, <code>run_workflow</code>, <code>workflow_status</code> e
            <code>cancel_workflow</code> numa conversa com um bot.
          </p>
        </section>

        <section aria-label="Resposta" className="min-h-0 overflow-auto px-4 py-4">
          {last ? (
            <div className="rounded-xl border border-hairline bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide", METHOD_TONE[last.method])}>{last.method}</span>
                <code className="min-w-0 break-all text-[12px] text-ink">{last.path}</code>
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums", statusTone(last.status))}>
                  {last.error ? "erro de rede" : last.status}
                </span>
                <span className="text-[11.5px] tabular-nums text-ink-tertiary">{last.ms} ms</span>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-tertiary">Corpo enviado</span>
                    {last.requestBody && (
                      <button type="button" onClick={() => void copy(last.requestBody ?? "", `${last.stepId}-request`)} className="flex items-center gap-1 text-[11px] text-ink-secondary hover:text-ink">
                        {copied === `${last.stepId}-request` ? <Check size={12} className="text-success" /> : <Copy size={12} />} copiar
                      </button>
                    )}
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-app p-3 font-mono text-[11.5px] leading-relaxed text-ink-secondary">{last.requestBody ?? "(sem corpo)"}</pre>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-tertiary">Resposta</span>
                    <button type="button" onClick={() => void copy(pretty(last.response), `${last.stepId}-response`)} className="flex items-center gap-1 text-[11px] text-ink-secondary hover:text-ink">
                      {copied === `${last.stepId}-response` ? <Check size={12} className="text-success" /> : <Copy size={12} />} copiar
                    </button>
                  </div>
                  <pre className="max-h-[52vh] overflow-auto rounded-lg bg-app p-3 font-mono text-[11.5px] leading-relaxed text-ink">{last.error ? last.error : pretty(last.response)}</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-48 place-items-center rounded-xl border border-dashed border-hairline p-6 text-center">
              <div>
                <Terminal size={22} className="mx-auto text-ink-tertiary" />
                <p className="mt-2 text-[13px] font-medium text-ink">Nenhuma resposta ainda</p>
                <p className="mt-1 text-[12px] text-ink-secondary">Clique em <strong>Executar</strong> num passo, ou em <strong>Executar tudo</strong>.</p>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-tertiary">Histórico</h2>
              <ul className="space-y-1">
                {history.map((entry) => (
                  <li key={`${entry.at}-${entry.stepId}`}>
                    <button
                      type="button"
                      onClick={() => setLast(entry)}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] hover:bg-raised", last === entry && "bg-raised")}
                    >
                      <span className={cn("rounded px-1 py-0.5 text-[9.5px] font-bold", METHOD_TONE[entry.method])}>{entry.method}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-ink-secondary">{entry.path}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", statusTone(entry.status))}>{entry.error ? "erro" : entry.status}</span>
                      <span className="w-12 text-right tabular-nums text-ink-tertiary">{entry.ms} ms</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
