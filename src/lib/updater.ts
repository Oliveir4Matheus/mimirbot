import { useEffect, useState } from "react";
import type { UpdaterState, UpdateChannel } from "@/types/ogb";

export type { UpdaterState, UpdateChannel };

export function useUpdaterState(): UpdaterState | null {
  const [state, setState] = useState<UpdaterState | null>(null);
  useEffect(() => window.ogb?.updater?.onState(setState), []);
  return window.ogb?.updater ? state : null;
}
