// Dev-only live view of a Workflow run. A bot step never crosses HTTP: the
// engine calls startTurn in this same process, so the observable wire is the
// `workflow.run` frame (transitions), the step thread's runtime events (the
// brief and the tool calls) and the run's own `run.json`.
//
//   node --experimental-strip-types scripts/workflow-watch.ts --url http://127.0.0.1:8999
//   node --experimental-strip-types scripts/workflow-watch.ts --url http://127.0.0.1:8999 --proxy-port 9001
//
// With --proxy-port the script also opens a loopback proxy in front of the
// server. Point the app (OMB_PORT) and any fixture at the proxy to see every
// route and JSON body the app sends; SSE is streamed through unbuffered.
//
// `--run <id>` narrows the frame output to one run. The script is read-only.
import { createServer, request as httpRequest } from "node:http";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:8999" },
    run: { type: "string" },
    "proxy-port": { type: "string" },
  },
});

const base = values.url!.replace(/\/+$/, "");
const upstream = new URL(base);
const onlyRun = values.run;
const stepThreads = new Map<string, { runId: string; stepId: string }>();

const clock = () => new Date().toISOString().slice(11, 23);
const line = (text: string) => process.stdout.write(`${text}\n`);
const clip = (text: string | undefined, max = 160) => {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const SECRET = /token|password|secret|api[-_]?key|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
    SECRET.test(key) ? [key, "***"] : [key, redact(entry)]));
}

function printRun(run: Record<string, unknown>): void {
  const id = String(run.id);
  if (onlyRun && id !== onlyRun) return;
  const steps = run.steps as Array<Record<string, unknown>>;
  const current = Number(run.currentStep);
  const status = String(run.status);
  const error = run.error ? ` — ${clip(String(run.error), 200)}` : "";
  const pause = run.pause ? ` — pause: ${clip(String((run.pause as Record<string, unknown>).question), 120)}` : "";
  line(`\n${clock()} RUN ${id} ${status} (step ${Math.min(current + 1, steps.length)}/${steps.length})${error}${pause}`);
  for (const step of steps) {
    const marks = [
      String(step.status),
      step.attempts && Number(step.attempts) > 1 ? `${step.attempts}x` : "",
      Array.isArray(step.verified) && step.verified.length > 0 ? `verified=${(step.verified as string[]).join(",")}` : "",
      step.error ? `error=${clip(String(step.error), 160)}` : "",
    ].filter(Boolean);
    line(`  ${step.id}: ${marks.join(" ")}`);
    if (typeof step.threadId === "string") stepThreads.set(step.threadId, { runId: id, stepId: String(step.id) });
  }
}

function printRuntime(event: Record<string, unknown>): void {
  const threadId = String(event.threadId ?? "");
  const owner = stepThreads.get(threadId);
  if (!owner || (onlyRun && owner.runId !== onlyRun)) return;
  const tag = `${owner.runId.slice(0, 8)}/${owner.stepId}`;
  const type = String(event.type);
  if (type === "turn.started") return void line(`  [${tag}] turn started`);
  if (type === "turn.completed") {
    return void line(`  [${tag}] turn completed ok=${String(event.ok)}${event.stopReason ? ` stop=${String(event.stopReason)}` : ""}`);
  }
  if (type === "item.started" && event.itemType === "tool") {
    return void line(`  [${tag}] tool ${clip(String(event.title ?? "tool"), 80)}${event.summary ? ` — ${clip(String(event.summary))}` : ""}`);
  }
  if (type === "item.completed" && event.itemType === "tool") {
    return void line(`  [${tag}] tool done ok=${String(event.ok)}${event.output ? ` — ${clip(String(event.output))}` : ""}`);
  }
  if (type === "request.opened") {
    return void line(`  [${tag}] ${String(event.requestType)} ${String(event.tool)} — ${clip(String(event.summary))}`);
  }
  if (type === "runtime.error") {
    return void line(`  [${tag}] ERROR ${clip(String(event.message), 240)}`);
  }
}

function printMessage(frame: Record<string, unknown>): void {
  const threadId = String(frame.threadId ?? "");
  const owner = stepThreads.get(threadId);
  if (!owner || (onlyRun && owner.runId !== onlyRun)) return;
  const message = frame.message as Record<string, unknown> | undefined;
  if (!message) return;
  const role = String(message.role);
  const text = typeof message.text === "string" ? message.text : "";
  if (!text.trim()) return;
  const tag = `${owner.runId.slice(0, 8)}/${owner.stepId}`;
  const label = role === "user" ? "BRIEF" : role === "bot" ? "BOT" : role.toUpperCase();
  line(`  [${tag}] ${label}: ${clip(text, 220)}`);
}

function logRequest(method: string, path: string, body: Buffer): void {
  line(`\n${clock()} → ${method} ${path}`);
  const text = body.toString("utf8");
  if (!text) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    line(`  ${clip(text, 1_000)}`);
    return;
  }
  const pretty = JSON.stringify(redact(parsed), null, 2);
  line(pretty.length > 4_000 ? `${pretty.slice(0, 4_000)}\n  … (${pretty.length} chars)` : pretty);
}

function startProxy(port: number): void {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      logRequest(req.method ?? "GET", req.url ?? "/", body);
      const target = new URL(req.url ?? "/", base);
      const forward = httpRequest({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: upstream.host },
      }, (answer) => {
        line(`  ← ${answer.statusCode ?? 0} ${req.method ?? "GET"} ${req.url ?? "/"}`);
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      });
      forward.on("error", (error) => {
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
      if (body.length > 0) forward.write(body);
      forward.end();
    });
  });
  server.listen(port, "127.0.0.1", () => line(`proxy http://127.0.0.1:${port} → ${base} (point OMB_PORT here)`));
}

async function followEvents(): Promise<void> {
  line(`watching ${base}/api/events${onlyRun ? ` for run ${onlyRun}` : ""} (Ctrl-C stops)`);
  const response = await fetch(`${base}/api/events`, { headers: { accept: "text/event-stream" } });
  if (!response.ok || !response.body) throw new Error(`events: ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const data = block.split("\n").find((row) => row.startsWith("data: "));
      if (!data) continue;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(data.slice(6)) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (frame.kind === "workflow.run") {
        printRun(frame.run as Record<string, unknown>);
      } else if (frame.kind === "runtime") {
        printRuntime(frame.event as Record<string, unknown>);
      } else if (frame.kind === "message") {
        printMessage(frame);
      }
    }
  }
}

if (values["proxy-port"] !== undefined) {
  const port = Number(values["proxy-port"]);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error("--proxy-port must be a TCP port");
  startProxy(port);
}

followEvents().catch((error) => {
  line(`workflow-watch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
