import { readXlsxWorkbook } from "./xlsx";

self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array }>) => {
  try {
    self.postMessage({ workbook: await readXlsxWorkbook(new Uint8Array(event.data.bytes)) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "format" });
  }
};
