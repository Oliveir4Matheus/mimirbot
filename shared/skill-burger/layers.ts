// A run as burger layers: one per real step a bot took for the person's last ask that changed something (a command, a
// file it wrote, an app action, a page it opened). Looking around (reads, listings, searches) is not a layer, and a
// failed attempt a later call of the same tool replaced is dropped as a retry.
import { isReadOnlyAction } from "../connector-scopes.ts";
import { connectorCallsIn } from "../outbound.ts";
import { isConnectedAppsServer } from "../own-apps.ts";
import { parseRunCommand } from "../run-command.ts";
import { nameIsCommand } from "../tool-name.ts";

export type LayerKind = "shell" | "file" | "app" | "browser" | "computer";
export type LayerStatus = "running" | "done" | "failed";

/** The few message fields a run is read from: the same on the client and the server. */
export interface RunMessage {
  id: string;
  role: string;
  kind?: string;
  text?: string;
  tool?: { name: string; ok?: boolean; summary?: string; input?: string; output?: string } | null;
}

export interface BurgerLayer {
  /** The message id, with `#n` for the nth tool of one multi-app call. */
  id: string;
  messageId: string;
  kind: LayerKind;
  /** The connected app's lowercase slug (gmail), for app layers. */
  app?: string;
  /** What replays it: a Composio slug, a plain app tool name, or the tool's name. */
  tool: string;
  /** Words for the line: the app action ("send email"), the command's label, a file name. */
  words: string;
  status: LayerStatus;
  read: boolean;
  /** `exact` replays without AI; `no` is a step this version cannot repeat. */
  replay: "exact" | "no";
  /** The parsed call: {command} or {path, content}. */
  args?: Record<string, unknown>;
  output?: string;
}

const MULTI_EXECUTE = "COMPOSIO_MULTI_EXECUTE_TOOL";
const APP_META_TOOL = /^COMPOSIO_(?:SEARCH_TOOLS|GET_TOOL_SCHEMAS|MANAGE_CONNECTIONS|WAIT_FOR_CONNECTIONS?|CHECK_ACTIVE_CONNECTIONS?|INITIATE_CONNECTION|LIST_TOOLKITS)$/;
const APP_CODE_TOOL = /^COMPOSIO_(?:REMOTE_WORKBENCH|REMOTE_BASH_TOOL|PROXY_EXECUTE)$/;
const APP_SLUG = /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/;
const PLAIN_APP_TOOL = /^([a-z][a-z0-9]*)\.([a-z][a-z0-9_]*)$/;
/** The app's own servers: coordination, computers, memory. Never a layer. */
const OWN_SERVERS = new Set(["agents", "phone", "device", "dweb", "ogb", "data", "memory", "permission"]);
/** A desktop the bot drives: its cloud computer, or the person's own computer. */
const COMPUTER_SERVERS = new Set(["computer", "localComputer"]);
/** Looking at a desktop changes nothing: never a layer. */
const COMPUTER_LOOK = /^(?:screenshot|get_screen_size|exec_status|move|wait|zoom|cursor_position|list_[a-z_]+|read_[a-z_]+|get_[a-z_]+)$/;
const FILE_WRITE = new Set(["Write", "write_file", "create_file"]);
const FILE_EDIT = new Set(["Edit", "MultiEdit", "NotebookEdit", "edit", "apply_patch", "str_replace_based_edit_tool"]);
const BROWSER_OPEN = /(?:^|_)(?:navigate|open|open_url|goto|tab_new)$/;
const BROWSER_LOOK = /(?:^|_)(?:snapshot|screenshot|read|get_text|status|tabs|wait|check|console|network|close|evaluate_read)$/;
/** A status row the app writes as an activity: a lowercase word, a colon, then words, never a tool name. */
const STATUS_ROW = /^[a-z]+: \S/;
/** An input the driver clipped, or a value the server masked: the call can't be repeated as recorded. */
const CLIPPED = /\[(?:additional data|large content|binary content|items|fields) omitted\]|\[… preview shortened\]|••••••|«redacted \d+ chars»|\[redacted\]/;

function parse(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);
const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
const sentence = (words: string) => words.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();

/** The server and bare tool of an MCP name (mcp__composio__GMAIL_SEND_EMAIL); a bare name has no server. */
function splitName(name: string): { server: string | null; bare: string } {
  if (!name.startsWith("mcp__")) return { server: null, bare: name };
  const [, server = "", ...rest] = name.split("__");
  return { server, bare: rest.join("__") };
}

/** GMAIL_SEND_EMAIL → app gmail, words "send email". */
function slugParts(slug: string): { app: string; words: string } {
  const tokens = slug.split("_").filter(Boolean);
  return { app: (tokens[0] ?? slug).toLowerCase(), words: sentence(tokens.slice(1).join(" ")) };
}

type RawLayer = Omit<BurgerLayer, "read"> & { read?: boolean };

function appLayer(base: Omit<BurgerLayer, "kind" | "app" | "tool" | "words" | "read" | "replay" | "args">, slug: string, args: unknown): RawLayer | null {
  if (APP_META_TOOL.test(slug)) return null;
  const { app, words } = slugParts(slug);
  const code = APP_CODE_TOOL.test(slug);
  return {
    ...base, kind: "app", app: code ? undefined : app, tool: slug, words: code ? "run code" : words,
    read: !code && isReadOnlyAction(slug), replay: "no",
    ...(isRecord(args) ? { args } : {}),
  };
}

/** The layers one tool message stands for: none, one, or one per app of a multi-app call. */
export function layersOf(message: RunMessage, live: ReadonlySet<string> = new Set()): BurgerLayer[] {
  return layersIn(message, live)
    .filter((layer) => !layer.read)
    .map(({ read: _read, ...layer }) => ({ ...layer, read: false }));
}

function layersIn(message: RunMessage, live: ReadonlySet<string>): RawLayer[] {
  const tool = message.tool;
  if (message.kind !== "activity" || !tool?.name) return [];
  // The app's own status rows ("recovery: …", "notice: …") ride in activity messages too; they are not steps.
  if (STATUS_ROW.test(tool.name)) return [];
  const status: LayerStatus = tool.ok === false ? "failed" : tool.ok === undefined && live.has(message.id) ? "running" : "done";
  const base = { messageId: message.id, status, ...(tool.output ? { output: tool.output } : {}) };
  const input = parse(tool.input);
  const clipped = Boolean(tool.input && CLIPPED.test(tool.input));
  const { server, bare } = splitName(tool.name);

  if (server && COMPUTER_SERVERS.has(server)) {
    if (COMPUTER_LOOK.test(bare)) return [];
    if (bare === "exec" || bare === "run_command") {
      const full = text(input?.command);
      if (!full || !parseRunCommand(full)) return [];
      return [{ ...base, id: message.id, kind: "shell", tool: `${server}.exec`, words: shellLine(full), replay: clipped ? "no" : "exact", args: { command: full } }];
    }
    return [{ ...base, id: message.id, kind: "computer", tool: `${server}.${bare}`, words: sentence(bare), replay: "no", ...(input ? { args: input } : {}) }];
  }
  if (bare === "vm_exec") {
    const full = text(input?.command);
    if (!full || !parseRunCommand(full)) return [];
    return [{ ...base, id: message.id, kind: "shell", tool: "vm_exec", words: shellLine(full), replay: clipped ? "no" : "exact", args: { command: full } }];
  }
  if (server && OWN_SERVERS.has(server)) return [];

  if (bare === MULTI_EXECUTE) {
    const calls = connectorCallsIn(MULTI_EXECUTE, input ?? {});
    return calls.flatMap((call, index) => {
      const layer = appLayer({ ...base, id: calls.length > 1 ? `${message.id}#${index}` : message.id }, call.slug, call.arguments);
      return layer ? [layer] : [];
    });
  }
  const plain = PLAIN_APP_TOOL.exec(bare);
  if (plain && (!server || isConnectedAppsServer(server))) {
    return [{
      ...base, id: message.id, kind: "app", app: plain[1]!, tool: `${plain[1]}.${plain[2]}`, words: sentence(plain[2]!),
      read: /^(?:search|read|list|get|find|fetch)/.test(plain[2]!), replay: "no", ...(input ? { args: input } : {}),
    }];
  }
  if (APP_SLUG.test(bare) && (!server || isConnectedAppsServer(server))) {
    const layer = appLayer({ ...base, id: message.id }, bare, input);
    return layer ? [layer] : [];
  }
  if (/browser/i.test(server ?? "") || /^(?:agent_)?browser_/.test(bare)) {
    if (BROWSER_LOOK.test(bare)) return [];
    const url = text(input?.url);
    if (BROWSER_OPEN.test(bare) && url) {
      let host = url;
      try { host = new URL(url).host || url; } catch { /* keep the text */ }
      return [{ ...base, id: message.id, kind: "browser", tool: bare, words: host, replay: "no", args: { url } }];
    }
    return [{ ...base, id: message.id, kind: "browser", tool: bare, words: sentence(bare.replace(/^(?:agent_)?browser_/, "")), replay: "no", ...(input ? { args: input } : {}) }];
  }
  if (server && !isConnectedAppsServer(server)) {
    // Another MCP server the person added: an app step only its own engine can call.
    return [{ ...base, id: message.id, kind: "app", app: server.toLowerCase(), tool: tool.name, words: sentence(bare), read: /^(?:get|list|search|read|find|fetch|query)/i.test(bare), replay: "no", ...(input ? { args: input } : {}) }];
  }
  if (FILE_WRITE.has(bare) || FILE_EDIT.has(bare)) {
    const path = text(input?.file_path) ?? text(input?.path) ?? text(input?.notebook_path);
    if (!path) return [{ ...base, id: message.id, kind: "file", tool: bare, words: "edit files", replay: "no" }];
    const content = typeof input?.content === "string" ? input.content : undefined;
    const exact = FILE_WRITE.has(bare) && content !== undefined && !clipped;
    return [{ ...base, id: message.id, kind: "file", tool: bare, words: baseName(path), replay: exact ? "exact" : "no", args: exact ? { path, content } : { path } }];
  }
  const command = text(tool.summary) ?? text(input?.command) ?? (nameIsCommand(tool.name) ? tool.name : undefined);
  if (command && (bare === "Bash" || bare === "shell" || bare === "vm_exec" || /^(?:exec_command|run_shell_command|bash|terminal)$/i.test(bare) || nameIsCommand(tool.name) || text(input?.command))) {
    const parsed = parseRunCommand(command);
    if (!parsed) return [];
    const full = text(input?.command);
    const cwd = text(input?.cwd);
    // Without the recorded input the summary may be cut or redacted: the text alone can't prove a repeat.
    return [{ ...base, id: message.id, kind: "shell", tool: bare === "vm_exec" ? "vm_exec" : "shell", words: shellLine(full ?? command), replay: full && !clipped ? "exact" : "no", args: { command: full ?? command, ...(cwd ? { cwd } : {}) } }];
  }
  return [];
}

function askIndex(messages: readonly RunMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role === "user" && m.kind === "text" && m.text?.trim()) return i;
  }
  return -1;
}

/** The person's last ask, its first line. */
export function askOf(messages: readonly RunMessage[]): string | undefined {
  const index = askIndex(messages);
  if (index < 0) return undefined;
  const line = messages[index]!.text!.trim().split(/\r?\n/, 1)[0]!.trim();
  return line || undefined;
}

/** A command as its layer reads: its first line, cut at 60 characters. */
function shellLine(command: string): string {
  const line = command.trim().split(/\r?\n/, 1)[0]!.replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

const sameStep = (a: BurgerLayer, b: BurgerLayer) => a.kind === b.kind && a.tool === b.tool && (a.app ?? "") === (b.app ?? "");

/** The run since the person's last ask, as layers. */
export function burgerLayers(messages: readonly RunMessage[], live: ReadonlySet<string> = new Set()): BurgerLayer[] {
  const layers = messages.slice(askIndex(messages) + 1).flatMap((message) => layersOf(message, live));
  return layers.filter((layer, index) => layer.status !== "failed" || !layers.slice(index + 1).some((later) => later.status !== "failed" && sameStep(layer, later)));
}

/** A burger shows for a run of two real steps or more. */
export const BURGER_MIN_LAYERS = 2;

/** The finished layers this slice can repeat without AI: commands and file writes it recorded exactly. */
export function replayableLayers(layers: readonly BurgerLayer[]): BurgerLayer[] {
  return layers.filter((layer) => layer.status === "done" && layer.replay === "exact" && (layer.kind === "shell" || layer.kind === "file"));
}
