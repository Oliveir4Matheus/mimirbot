import type { WorkflowArtifactPreview, WorkflowArtifactOrigin } from "../../shared/workflow";
import { activeLocale } from "@/lib/i18n";

const TYPE_LABEL: Record<WorkflowArtifactPreview, string> = {
  text: "TXT", markdown: "MD", json: "JSON", csv: "CSV", image: "IMG", pdf: "PDF", audio: "AUDIO", video: "VIDEO", none: "FILE",
};

export function artifactTypeLabel(preview: WorkflowArtifactPreview): string {
  return TYPE_LABEL[preview];
}

export function artifactKey(origin: WorkflowArtifactOrigin, path: string): string {
  return origin.kind === "step"
    ? `step-${origin.step}:${path}`
    : `step-${origin.step}:iter-${origin.iteration}:${origin.body}:${path}`;
}

export function formatArtifactBytes(bytes: number): string {
  const power = bytes >= 1024 ** 3 ? 3 : bytes >= 1024 ** 2 ? 2 : bytes >= 1024 ? 1 : 0;
  return `${new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: power === 3 ? 1 : 0 }).format(bytes / 1024 ** power)} ${["B", "KB", "MB", "GB"][power]}`;
}
