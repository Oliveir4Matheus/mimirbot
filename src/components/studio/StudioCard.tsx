import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BookOpen, Check, Clock, Code2, CornerUpLeft, FileText, GitBranch, Layers, List, Maximize2, MoreHorizontal, Play, Plus, Repeat, Sparkles, Wrench, X,
} from "lucide-react";

import type { WorkflowStep } from "../../../shared/workflow";
import type { LocaleKey } from "@/locales";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { branchCenters, branchTop } from "./studio-geometry";
import { CARD_HEIGHT, CARD_WIDTH, skillCount, type StudioBranch, type StudioDraft } from "./studio-model";

const CATEGORY = { bot: "AI AGENT", script: "CODE STEP", condition: "CONDITIONAL", loop: "DO WHILE" } as const;

const clip = (text: string, max = 85) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

type BranchKey = "instructions" | "context" | "tools" | "skills" | "return" | "run" | "input" | "output" | "script" | "condition" | "true" | "false" | "failure" | "timeout";

interface BranchSpec {
  key: BranchKey;
  label: LocaleKey;
  icon: typeof Sparkles;
  color?: string;
  port?: StudioBranch;
}

const BOT_BRANCHES: BranchSpec[] = [
  { key: "instructions", label: "studio.branch.instructions", icon: FileText },
  { key: "context", label: "studio.branch.context", icon: Layers },
  { key: "tools", label: "studio.branch.tools", icon: Wrench },
  { key: "skills", label: "studio.branch.skills", icon: BookOpen },
  { key: "return", label: "studio.branch.return", icon: CornerUpLeft },
  { key: "run", label: "studio.branch.run", icon: Play, port: "run" },
];

const SCRIPT_BRANCHES: BranchSpec[] = [
  { key: "input", label: "studio.branch.input", icon: ArrowDownToLine },
  { key: "output", label: "studio.branch.output", icon: ArrowUpFromLine },
  { key: "script", label: "studio.branch.script", icon: Code2 },
  { key: "run", label: "studio.branch.run", icon: Play, port: "run" },
];

const CONDITION_BRANCHES: BranchSpec[] = [
  { key: "run", label: "studio.branch.run", icon: Play },
  { key: "condition", label: "studio.branch.condition", icon: List },
];

const LOOP_BRANCHES: BranchSpec[] = [
  { key: "condition", label: "studio.branch.condition", icon: List },
  { key: "run", label: "studio.branch.run", icon: Play, port: "run" },
];

const TRUE_BRANCH: BranchSpec = { key: "true", label: "studio.branch.true", icon: Check, color: "var(--color-success)", port: "true" };
const FALSE_BRANCH: BranchSpec = { key: "false", label: "studio.branch.false", icon: X, color: "var(--color-danger)", port: "false" };
const FAILURE_BRANCH: BranchSpec = { key: "failure", label: "studio.branch.failure", icon: AlertTriangle, color: "var(--color-danger)", port: "failure" };
const TIMEOUT_BRANCH: BranchSpec = { key: "timeout", label: "studio.branch.timeout", icon: Clock, color: "var(--studio-node-condition)", port: "timeout" };

export function StudioCard({ draft, step, index, selected, botName, onSelect, onDragStart, onEntry, onBranch, onPort, onRename, onDuplicate, onDelete, onExpand }: {
  draft: StudioDraft;
  step: WorkflowStep;
  index: number;
  selected: boolean;
  botName: (id: string) => string;
  onSelect: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  onEntry: () => void;
  onBranch: (branch: BranchKey, anchor: DOMRect) => void;
  onPort: (branch: StudioBranch, event: React.PointerEvent) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExpand?: () => void;
}) {
  const node = draft.canvas.nodes[step.id] ?? { x: 0, y: 0 };
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(step.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setName(step.name), [step.name]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".studio-card-menu-button")) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const nameOf = (id: string) => draft.steps.find((candidate) => candidate.id === id)?.name ?? id;
  const preview = (key: BranchKey): string => {
    if (step.kind === "bot") {
      if (key === "instructions") return clip(step.instructions);
      if (key === "context") return step.inputs.length ? step.inputs.map((input) => input.as).join(", ") : t("studio.card.noContext");
      if (key === "tools") return botName(step.botId) || t("studio.card.noBot");
      if (key === "skills") {
        const count = skillCount(step);
        return count === 0 ? t("studio.card.noSkills") : count === 1 ? t("studio.card.skillCountOne") : t("studio.card.skillCount", { count });
      }
      if (key === "return") return step.result ?? t("studio.card.noResult");
      if (key === "run") return typeof step.onSuccess === "string" ? nameOf(step.onSuccess) : t("studio.card.end");
      if (key === "failure") return step.onFailure ? nameOf(step.onFailure) : t("studio.condition.none");
      if (key === "timeout") return step.onTimeout ? nameOf(step.onTimeout) : t("studio.condition.none");
    }
    if (step.kind === "script") {
      if (key === "input") return step.inputs.length ? step.inputs.map((input) => input.as).join(", ") : t("studio.card.noContext");
      if (key === "output") return step.outputs.map((output) => output.path).join(", ");
      if (key === "script") return step.run;
      if (key === "run") return typeof step.onSuccess === "string" ? nameOf(step.onSuccess) : t("studio.card.end");
      if (key === "failure") return step.onFailure ? nameOf(step.onFailure) : t("studio.condition.none");
      if (key === "timeout") return step.onTimeout ? nameOf(step.onTimeout) : t("studio.condition.none");
    }
    if (step.kind === "condition") {
      if (key === "condition") {
        const match = step.match === "any" ? t("studio.condition.any") : t("studio.condition.all");
        if (step.conditions.length !== 1) return `${match} · ${t("studio.condition.count", { count: step.conditions.length })}`;
        const line = step.conditions[0]!;
        return `${match} · ${line.field} ${line.op}${line.value === undefined ? "" : ` ${JSON.stringify(line.value)}`}`;
      }
      if (key === "run") return t("studio.condition.twoRoutes");
      if (key === "true") return step.whenTrue ? nameOf(step.whenTrue) : t("studio.condition.none");
      if (key === "false") return step.whenFalse ? nameOf(step.whenFalse) : t("studio.condition.none");
      if (key === "failure") return step.onFailure ? nameOf(step.onFailure) : t("studio.condition.none");
    }
    if (step.kind === "loop") {
      if (key === "condition") {
        const line = step.conditions[0];
        const condition = line
          ? `${line.field} ${line.op}${line.value === undefined ? "" : ` ${JSON.stringify(line.value)}`}`
          : t("studio.condition.count", { count: step.conditions.length });
        return `${t("studio.loop.stopWhen", { condition })} · ${t("studio.loop.max", { count: step.maxIterations })}`;
      }
      if (key === "run") return typeof step.onSuccess === "string" ? nameOf(step.onSuccess) : t("studio.card.end");
      if (key === "failure") return step.onFailure ? nameOf(step.onFailure) : t("studio.condition.none");
    }
    return "";
  };

  const category = CATEGORY[step.kind];
  const icon = step.kind === "bot" ? <Sparkles size={21} strokeWidth={1.8} />
    : step.kind === "script" ? <Code2 size={21} strokeWidth={1.8} />
      : step.kind === "loop" ? <Repeat size={21} strokeWidth={1.8} />
        : <GitBranch size={21} strokeWidth={1.8} />;
  const accent = step.kind === "bot" ? "var(--studio-node-bot)" : step.kind === "script" ? "var(--studio-node-script)" : step.kind === "loop" ? "var(--studio-node-loop)" : "var(--studio-node-condition)";
  const accentSoft = step.kind === "bot" ? "color-mix(in srgb, var(--studio-node-bot) 16%, var(--color-card))" : step.kind === "script" ? "color-mix(in srgb, var(--studio-node-script) 16%, var(--color-card))" : step.kind === "loop" ? "color-mix(in srgb, var(--studio-node-loop) 16%, var(--color-card))" : "color-mix(in srgb, var(--studio-node-condition) 16%, var(--color-card))";
  const waiting = step.kind === "bot" ? t("studio.card.waitingAgent")
    : step.kind === "script" ? t("studio.card.waitingScript")
      : step.kind === "loop" ? t("studio.loop.bodyCount", { count: step.body.length })
        : t("studio.card.waitingCondition");
  const branches = step.kind === "bot" ? BOT_BRANCHES : step.kind === "script" ? SCRIPT_BRANCHES : step.kind === "loop" ? LOOP_BRANCHES : CONDITION_BRANCHES;
  const sideBranches = step.kind === "condition" ? [TRUE_BRANCH, FALSE_BRANCH, FAILURE_BRANCH]
    : step.kind === "loop" ? [FAILURE_BRANCH]
      : [FAILURE_BRANCH, TIMEOUT_BRANCH];
  const centers = step.kind === "condition" ? [79, 161] : branchCenters(branches.length);
  const width = step.kind === "condition" ? 340 : CARD_WIDTH;

  const commitName = () => {
    const trimmed = name.trim().slice(0, 120);
    if (trimmed) onRename(trimmed);
    else setName(step.name);
    setRenaming(false);
  };

  return (
    <div
      className={cn("studio-node", `studio-node-${step.kind}`, selected && "studio-node-selected")}
      style={{ left: node.x, top: node.y, width }}
      data-studio-step={step.id}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button,input,textarea,.studio-port")) return;
        onSelect();
        onDragStart(event);
      }}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    >
      <div className={cn("studio-card", selected && "studio-card-selected")} style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}>
        <div className="studio-card-head">
          <span className="studio-card-icon" style={{ background: accentSoft, color: accent }}>{icon}</span>
          <span className="studio-card-title">
            {renaming ? (
              <input
                autoFocus
                value={name}
                maxLength={120}
                aria-label={t("studio.menu.rename")}
                onChange={(event) => setName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitName();
                  if (event.key === "Escape") { setName(step.name); setRenaming(false); }
                }}
                className="studio-rename"
              />
            ) : (
              <span className="studio-card-name" title={step.name}>{step.name}</span>
            )}
            <span className="studio-card-category">{category}</span>
          </span>
          {step.kind === "loop" && onExpand && (
            <button
              type="button"
              aria-label={t("studio.loop.expand")}
              title={t("studio.loop.expand")}
              className="studio-card-expand"
              onClick={(event) => { event.stopPropagation(); onExpand(); }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            aria-label={t("studio.menu.more")}
            className="studio-card-menu-button"
            onClick={(event) => { event.stopPropagation(); setMenu((open) => !open); }}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="studio-card-divider" />
        <div className="studio-card-foot">
          <span className={cn("studio-status-dot", `studio-status-${step.kind}`)} aria-hidden="true" />
          <span className="studio-card-status">{waiting}</span>
          <span className="studio-card-id">N{index + 1}</span>
        </div>
        {menu && (
          <div ref={menuRef} className="studio-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); setRenaming(true); }}>{t("studio.menu.rename")}</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onDuplicate(); }}>{t("studio.menu.duplicate")}</button>
            <button type="button" role="menuitem" className="studio-menu-danger" onClick={() => { setMenu(false); onDelete(); }}>{t("studio.menu.delete")}</button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="studio-entry"
        aria-label={t("studio.card.entry")}
        style={{ top: 46 }}
        onClick={(event) => { event.stopPropagation(); onEntry(); }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Plus size={11} aria-hidden="true" />
      </button>

      {step.kind !== "condition" && branches.map((branch, branchIndex) => {
        const center = centers[branchIndex]!;
        return (
          <span key={branch.key}>
            <span className="studio-branch-stem" style={{ left: center - 0.75, top: CARD_HEIGHT, height: 17 }} aria-hidden="true" />
            <button
              type="button"
              className="studio-branch"
              data-studio-branch={branch.key}
              style={{ left: center - 15.5, top: branchTop(node.y) - node.y }}
              onClick={(event) => { event.stopPropagation(); onBranch(branch.key, event.currentTarget.getBoundingClientRect()); }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <branch.icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="studio-branch-tip" role="tooltip">
                <strong>{t(branch.label)}</strong>
                <span>{preview(branch.key)}</span>
              </span>
            </button>
            {branch.port && (
              <button
                type="button"
                className="studio-port"
                aria-label={t("studio.card.connect")}
                style={{ left: center + 17, top: branchTop(node.y) - node.y + 9 }}
                onPointerDown={(event) => { event.stopPropagation(); onPort(branch.port!, event); }}
              />
            )}
          </span>
        );
      })}

      {step.kind === "condition" && CONDITION_BRANCHES.map((branch, branchIndex) => {
        const center = [79, 161][branchIndex]!;
        return (
          <span key={branch.key}>
            <span className="studio-branch-stem" style={{ left: center - 0.75, top: CARD_HEIGHT, height: 17 }} aria-hidden="true" />
            <button
              type="button"
              className="studio-branch"
              data-studio-branch={branch.key}
              style={{ left: center - 15.5, top: 129 }}
              onClick={(event) => { event.stopPropagation(); onBranch(branch.key, event.currentTarget.getBoundingClientRect()); }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <branch.icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="studio-branch-tip" role="tooltip">
                <strong>{t(branch.label)}</strong>
                <span>{preview(branch.key)}</span>
              </span>
            </button>
          </span>
        );
      })}

      {sideBranches.map((branch, row) => {
        const top = 21 + row * 47;
        return (
          <span key={branch.key}>
            <span className="studio-side-stem" style={{ left: CARD_WIDTH, top: top + 17.5, width: 19 }} aria-hidden="true" />
            <button
              type="button"
              className="studio-branch studio-side-branch"
              data-studio-branch={branch.key}
              style={{ left: CARD_WIDTH + 19, top: top + 2.5, color: branch.color }}
              onClick={(event) => { event.stopPropagation(); onBranch(branch.key, event.currentTarget.getBoundingClientRect()); }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <branch.icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="studio-branch-tip" role="tooltip">
                <strong>{t(branch.label)}</strong>
                <span>{preview(branch.key)}</span>
              </span>
            </button>
            <button
              type="button"
              className="studio-port studio-side-port"
              aria-label={t("studio.card.connect")}
              style={{ left: CARD_WIDTH + 19 + 30 + 9, top: top + 10 }}
              onPointerDown={(event) => { event.stopPropagation(); onPort(branch.port!, event); }}
            />
          </span>
        );
      })}
    </div>
  );
}

export type { BranchKey };
