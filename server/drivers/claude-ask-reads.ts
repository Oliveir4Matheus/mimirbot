import { readToolPaths } from "../own-file-reads.ts";

/** Claude's read tools' own paths for a permission ask; nothing for a question, another tool or no absolute path. */
export function claudeAskReads(kind: unknown, tool: unknown, input: unknown): { reads: string[] } | Record<string, never> {
  const reads = kind === "permission" ? readToolPaths(tool, input) : undefined;
  return reads ? { reads } : {};
}
