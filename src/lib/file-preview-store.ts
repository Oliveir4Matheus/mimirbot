import { useSyncExternalStore } from "react";

import type { MessageAttachmentContext } from "@/components/AttachmentPreview";
import type { PreviewPosition } from "@/components/FilePreviewDialog";

export interface FilePreviewRequest {
  path: string;
  name: string;
  message: MessageAttachmentContext;
  returnFocus?: HTMLElement | null;
}

interface FilePreviewState {
  request: FilePreviewRequest | null;
  position: PreviewPosition;
}

let state: FilePreviewState = { request: null, position: "center" };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): FilePreviewState {
  return state;
}

export function openFilePreview(request: FilePreviewRequest): void {
  state = { ...state, request };
  emit();
}

export function closeFilePreview(): void {
  state = { ...state, request: null };
  emit();
}

export function setFilePreviewPosition(position: PreviewPosition): void {
  state = { ...state, position };
  emit();
}

export function useFilePreview(): FilePreviewState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
