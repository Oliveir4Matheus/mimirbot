import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  planWorkflowArchive,
  workflowArchiveName,
  writeWorkflowArchive,
  WORKFLOW_ARCHIVE_BYTES_MAX,
  WORKFLOW_ARCHIVE_ENTRIES_MAX,
  type WorkflowArchiveItem,
} from "./archive.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "omb-workflow-archive-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

interface ParsedEntry {
  name: string;
  bytes: Buffer;
}

/** The store-only subset these fixtures write: local header, data, data descriptor. */
function readZip(zip: Buffer): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const flags = zip.readUInt16LE(offset + 6);
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    let end = start + size;
    if (flags & 0x0008) {
      // The local header carries zero sizes: the data descriptor marks the end.
      while (end + 16 <= zip.length && zip.readUInt32LE(end) !== 0x08074b50) end += 1;
      if (end + 16 > zip.length) throw new Error(`no descriptor for ${name}`);
    }
    entries.push({ name, bytes: zip.subarray(start, end) });
    offset = end + (flags & 0x0008 ? 16 : 0);
  }
  if (offset + 4 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) throw new Error("no central directory");
  return entries;
}

async function archive(items: WorkflowArchiveItem[]): Promise<Buffer> {
  const plan = planWorkflowArchive(items);
  if (!plan.ok) throw new Error(`plan refused: ${plan.reason}`);
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => out.on("end", resolve));
  await writeWorkflowArchive(out as unknown as Parameters<typeof writeWorkflowArchive>[0], plan);
  out.end();
  await done;
  return Buffer.concat(chunks);
}

const item = (name: string, bytes = "x"): WorkflowArchiveItem => {
  const file = join(root, `${name.replace(/\W/g, "-")}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(file, bytes);
  return { name, file, bytes: Buffer.byteLength(bytes), modifiedAt: 1_763_369_994_211 };
};

describe("workflowArchiveName", () => {
  it("groups a top-level step and a Do While round under their own folders", () => {
    expect(workflowArchiveName({ kind: "step", step: 1 }, "dados.csv")).toBe("step-1/dados.csv");
    expect(workflowArchiveName({ kind: "iteration", step: 3, iteration: 2, body: "preparar" }, "result.json"))
      .toBe("step-3/iter-2/preparar/result.json");
  });
});

describe("planWorkflowArchive", () => {
  it("renames a collision with -2 and -3", () => {
    const plan = planWorkflowArchive([
      { name: "step-1/a.txt", file: "/a", bytes: 1, modifiedAt: 0 },
      { name: "step-1/a.txt", file: "/b", bytes: 1, modifiedAt: 0 },
      { name: "step-1/a.txt", file: "/c", bytes: 1, modifiedAt: 0 },
      { name: "step-1/a", file: "/d", bytes: 1, modifiedAt: 0 },
      { name: "step-1/a", file: "/e", bytes: 1, modifiedAt: 0 },
    ]);
    expect(plan.ok && plan.entries.map((entry) => entry.name)).toEqual([
      "step-1/a.txt", "step-1/a-2.txt", "step-1/a-3.txt", "step-1/a", "step-1/a-2",
    ]);
  });

  it("refuses more than 2.000 entries and more than 512 MiB before writing", () => {
    const entry = { name: "step-1/a", file: "/a", bytes: 1, modifiedAt: 0 };
    expect(planWorkflowArchive([...Array(WORKFLOW_ARCHIVE_ENTRIES_MAX + 1)].map(() => entry)))
      .toEqual({ ok: false, reason: "entries", limit: WORKFLOW_ARCHIVE_ENTRIES_MAX, total: WORKFLOW_ARCHIVE_ENTRIES_MAX + 1 });
    expect(planWorkflowArchive([{ name: "step-1/big.bin", file: "/big", bytes: WORKFLOW_ARCHIVE_BYTES_MAX + 1, modifiedAt: 0 }]))
      .toEqual({ ok: false, reason: "bytes", limit: WORKFLOW_ARCHIVE_BYTES_MAX, total: WORKFLOW_ARCHIVE_BYTES_MAX + 1 });
  });
});

describe("writeWorkflowArchive", () => {
  it("writes stored entries that a classic unzip reads back", async () => {
    const zip = await archive([item("step-1/dados.csv", "nome,total\nana,10\n"), item("step-1/resumo.md", "# ok\n")]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(readZip(zip).map((entry) => [entry.name, entry.bytes.toString()])).toEqual([
      ["step-1/dados.csv", "nome,total\nana,10\n"],
      ["step-1/resumo.md", "# ok\n"],
    ]);
  });

  it("writes an empty file as a valid entry", async () => {
    const zip = await archive([item("step-1/vazio.txt", "")]);
    expect(readZip(zip)).toEqual([{ name: "step-1/vazio.txt", bytes: Buffer.alloc(0) }]);
  });
});
