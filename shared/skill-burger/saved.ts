// A saved burger as lists show it: its name, the summary on its top bun, one entry per step, its args, and when it was
// saved. Saved burgers live in the shared skills library for every bot.
import type { LayerKind } from "./layers.ts";

export interface SavedWorkflowLayer { id: string; kind: LayerKind; label: string }
export interface SavedWorkflow {
  name: string;
  summary: string;
  sha256: string;
  savedAt: string;
  layers: SavedWorkflowLayer[];
  args: string[];
}
