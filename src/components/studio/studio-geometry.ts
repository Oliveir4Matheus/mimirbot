// Card geometry from the approved v0.5 prototype: every branch, port and
// connection point is derived from the card's top-left corner, so a moved card
// carries its branches with it.
import { CARD_HEIGHT, CARD_WIDTH, type StudioDraft, type StudioBranch } from "./studio-model";

export const BRANCH_SIZE = 31;
export const BRANCH_STEM = 17;
export const BRANCH_INSET = 5;
export const BRANCH_SPAN = 230;
export const ENTRY_SIZE = 22;
export const ENTRY_OFFSET_Y = 57;
export const RUN_POINT_SIZE = 13;
export const CONDITION_SIDE = { start: CARD_WIDTH, width: 96, top: 21, row: 35, gap: 12, stem: 19, button: 30, pointGap: 9, point: 14 };

export interface Point { x: number; y: number }

export function branchCenters(count: number): number[] {
  const slot = BRANCH_SPAN / count;
  return Array.from({ length: count }, (_, index) => BRANCH_INSET + slot * (index + 0.5));
}

export function branchTop(y: number): number {
  return y + CARD_HEIGHT + BRANCH_STEM;
}

export function branchCenterY(y: number): number {
  return branchTop(y) + BRANCH_SIZE / 2;
}

export function entryPoint(node: Point): Point {
  return { x: node.x, y: node.y + ENTRY_OFFSET_Y };
}

export function entryHit(steps: ReadonlyArray<{ id: string }>, nodes: Record<string, Point>, point: Point, radius: number): string | undefined {
  let best: { id: string; distance: number } | undefined;
  for (const step of steps) {
    const node = nodes[step.id];
    if (!node) continue;
    const target = entryPoint(node);
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { id: step.id, distance };
  }
  return best?.id;
}

export function runPoint(node: Point, count: number): Point {
  const center = branchCenters(count)[count - 1]!;
  return { x: node.x + center + BRANCH_SIZE / 2 + 8, y: branchCenterY(node.y) };
}

export function conditionSidePoint(node: Point, branch: "true" | "false"): Point {
  const row = branch === "true" ? 0 : 1;
  const y = node.y + CONDITION_SIDE.top + row * (CONDITION_SIDE.row + CONDITION_SIDE.gap) + CONDITION_SIDE.row / 2;
  return {
    x: node.x + CONDITION_SIDE.start + CONDITION_SIDE.stem + CONDITION_SIDE.button + CONDITION_SIDE.pointGap + CONDITION_SIDE.point / 2,
    y,
  };
}

export function outputPoint(draft: StudioDraft, stepId: string, branch: StudioBranch): Point | undefined {
  const node = draft.canvas.nodes[stepId];
  const step = draft.steps.find((candidate) => candidate.id === stepId);
  if (!node || !step) return undefined;
  if (step.kind === "condition") return branch === "run" ? undefined : conditionSidePoint(node, branch);
  return branch === "run" ? runPoint(node, 5) : undefined;
}

export function bezier(from: Point, to: Point): string {
  const handle = Math.max(56, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + handle} ${from.y}, ${to.x - handle} ${to.y}, ${to.x} ${to.y}`;
}

export function noteAnchor(note: { x: number; y: number; width: number }): Point {
  return { x: note.x + note.width, y: note.y + 71 };
}

export function noteLinkTarget(note: { x: number; y: number; width: number; height: number }, target: { x: number; y: number; width: number; height: number }, container: boolean): Point {
  const anchor = { x: note.x + note.width, y: note.y + 71 };
  const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  if (container) return { x: target.x + target.width / 2, y: target.y + 22 };
  if (center.x >= anchor.x) return { x: target.x, y: target.y + ENTRY_OFFSET_Y };
  return { x: target.x + target.width, y: target.y + ENTRY_OFFSET_Y };
}
