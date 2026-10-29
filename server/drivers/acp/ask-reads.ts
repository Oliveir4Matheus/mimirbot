import { acpReadPaths } from "../../own-file-reads.ts";

/** An ACP read call's own paths for a permission ask; nothing for a question or a call that is not a read. */
export function acpAskReads(isQuestion: boolean, toolCall: unknown): { reads: string[] } | Record<string, never> {
  const reads = isQuestion || !toolCall || typeof toolCall !== "object" ? undefined : acpReadPaths(toolCall as { kind?: unknown; locations?: unknown; rawInput?: unknown });
  return reads ? { reads } : {};
}
