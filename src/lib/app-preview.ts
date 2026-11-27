import { useSyncExternalStore } from "react";

/** The published app shown inside the Published apps panel. Renderer-only: nothing here is stored or sent anywhere. */
export interface AppPreview {
  url: string;
  title: string;
}

/** `list` shows the cards; `preview` shows one page in the frame. */
export type AppPreviewState = { mode: "list" } | ({ mode: "preview" } & AppPreview);

const LIST: AppPreviewState = { mode: "list" };
let current: AppPreviewState = LIST;
const listeners = new Set<() => void>();

function set(next: AppPreviewState): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export const showPublishedAppsList = (): void => set(LIST);
export const previewPublishedApp = (preview: AppPreview): void => set({ mode: "preview", ...preview });

export function useAppPreview(): AppPreviewState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => LIST,
  );
}
