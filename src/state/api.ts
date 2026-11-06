// The renderer's JSON request helper. A Cloud home that went to sleep is never woken by a background poll
// (src/lib/cloud-power.ts).
import { asleepAnswer, BACKGROUND_HEADER, cloudAsleep, markCloudAsleep, markCloudAwake } from "../lib/cloud-power";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: Record<string, unknown>;
  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** `background`: a poll nobody asked for just now. It never wakes a Cloud home that went to sleep (it is refused here
 * instead, src/lib/cloud-power.ts) and the home doesn't count it as someone using it. Anything else wakes it. */
export async function api<T = any>(path: string, init?: RequestInit & { timeoutMs?: number; background?: boolean }): Promise<T> {
  const { timeoutMs, signal, background, headers, ...rest } = init ?? {};
  if (cloudAsleep()) {
    if (background) throw new ApiError("My Cloud is asleep", 503, { error: "asleep" });
    markCloudAwake();
  }
  const sent = new Headers(headers ?? { "content-type": "application/json" });
  if (background) sent.set(BACKGROUND_HEADER, "1");
  const res = await fetch(path, {
    ...rest,
    headers: sent,
    signal: timeoutMs === undefined
      ? signal
      : signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
  });
  if (asleepAnswer(res)) markCloudAsleep();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = body?.error;
    const message = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, body);
  }
  return body;
}

/** A 200 that isn't the snapshot: `api` turns a non-JSON answer into `{}`, and the reducer can't take a missing list. The part
 * fails instead, which keeps what's on screen. */
export function snapshotArrays<T>(answer: T, ...keys: (keyof T)[]): T {
  for (const key of keys) if (!Array.isArray(answer[key])) throw new Error(`Invalid snapshot: ${String(key)} is not a list`);
  return answer;
}

const RETRY_REQUEST_MS = [2_000, 5_000, 15_000, 30_000];

/** Sends `attempt` again after each failure, waiting longer each time, for as long as `wanted()` holds. */
export function retryRequest(wanted: () => boolean, attempt: () => Promise<unknown>): void {
  const run = (tries: number) => {
    attempt().catch(() => {
      if (wanted()) setTimeout(() => run(tries + 1), RETRY_REQUEST_MS[Math.min(tries, RETRY_REQUEST_MS.length - 1)]);
    });
  };
  run(0);
}
