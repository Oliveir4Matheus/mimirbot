import type { TextTable } from "./table-data";
import type { XlsxWorkbook } from "./xlsx";

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function parseTableInWorker(text: string, delimiter: "," | "\t", signal: AbortSignal): Promise<TextTable> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./table-file.worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ table?: TextTable; error?: string }>) => {
      finish();
      if (event.data.table) resolve(event.data.table);
      else reject(new Error(event.data.error ?? "format"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("format"));
    };
    worker.postMessage({ text, delimiter });
  });
}

export function parseWorkbookInWorker(bytes: Uint8Array, signal: AbortSignal): Promise<XlsxWorkbook> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./xlsx-preview.worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ workbook?: XlsxWorkbook; error?: string }>) => {
      finish();
      if (event.data.workbook) resolve(event.data.workbook);
      else reject(new Error(event.data.error ?? "format"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("format"));
    };
    worker.postMessage({ bytes });
  });
}
