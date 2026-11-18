// A ZIP of a run's artifacts. Entries are stored, never compressed, so the
// size is known from the list and the caps below are refused before the first
// byte leaves; a local header plus a data descriptor keeps memory flat.
import { constants, createReadStream, fstatSync, openSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { crc32 } from "node:zlib";

import type { WorkflowArtifactOrigin } from "../../shared/workflow.ts";

export const WORKFLOW_ARCHIVE_ENTRIES_MAX = 2_000;
export const WORKFLOW_ARCHIVE_BYTES_MAX = 512 * 1024 * 1024;

export interface WorkflowArchiveItem {
  name: string;
  file: string;
  bytes: number;
  modifiedAt: number;
}

export type WorkflowArchivePlan =
  | { ok: true; entries: WorkflowArchiveItem[]; bytes: number }
  | { ok: false; reason: "entries" | "bytes"; limit: number; total: number };

export function workflowArchiveName(origin: WorkflowArtifactOrigin, path: string): string {
  return origin.kind === "step"
    ? `step-${origin.step}/${path}`
    : `step-${origin.step}/iter-${origin.iteration}/${origin.body}/${path}`;
}

function uniqueName(name: string, used: ReadonlySet<string>): string {
  if (!used.has(name)) return name;
  const slash = name.lastIndexOf("/");
  const head = name.slice(0, slash + 1);
  const base = name.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot) : "";
  for (let index = 2; ; index += 1) {
    const candidate = `${head}${stem}-${index}${extension}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function planWorkflowArchive(items: readonly WorkflowArchiveItem[]): WorkflowArchivePlan {
  if (items.length > WORKFLOW_ARCHIVE_ENTRIES_MAX) {
    return { ok: false, reason: "entries", limit: WORKFLOW_ARCHIVE_ENTRIES_MAX, total: items.length };
  }
  let bytes = 0;
  for (const item of items) bytes += item.bytes;
  if (bytes > WORKFLOW_ARCHIVE_BYTES_MAX) {
    return { ok: false, reason: "bytes", limit: WORKFLOW_ARCHIVE_BYTES_MAX, total: bytes };
  }
  const used = new Set<string>();
  const entries = items.map((item) => {
    const name = uniqueName(item.name, used);
    used.add(name);
    return { ...item, name };
  });
  return { ok: true, entries, bytes };
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const DATA_DESCRIPTOR = 0x08074b50;
const END_OF_CENTRAL = 0x06054b50;
const FLAG_DESCRIPTOR = 0x0008;
const FLAG_UTF8 = 0x0800;

function dosDateTime(ms: number): { time: number; date: number } {
  const date = new Date(ms);
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function write(res: ServerResponse, chunk: Buffer): Promise<void> {
  if (res.destroyed) throw new Error("the response is gone");
  if (res.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const done = (error?: Error): void => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onDrain = (): void => done();
    const onClose = (): void => done(new Error("the response is gone"));
    res.once("drain", onDrain);
    res.once("close", onClose);
  });
}

function localHeader(name: Buffer, modifiedAt: number): Buffer {
  const header = Buffer.alloc(30);
  const { time, date } = dosDateTime(modifiedAt);
  header.writeUInt32LE(LOCAL_HEADER, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(FLAG_DESCRIPTOR | FLAG_UTF8, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt16LE(name.length, 26);
  return header;
}

function centralHeader(name: Buffer, modifiedAt: number, crc: number, bytes: number, offset: number): Buffer {
  const header = Buffer.alloc(46);
  const { time, date } = dosDateTime(modifiedAt);
  header.writeUInt32LE(CENTRAL_HEADER, 0);
  header.writeUInt16LE(0x031e, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(FLAG_DESCRIPTOR | FLAG_UTF8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(crc >>> 0, 16);
  header.writeUInt32LE(bytes >>> 0, 20);
  header.writeUInt32LE(bytes >>> 0, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(offset >>> 0, 42);
  return header;
}

interface EntryResult {
  crc: number;
  bytes: number;
}

async function writeEntryData(res: ServerResponse, item: WorkflowArchiveItem): Promise<EntryResult> {
  if (item.bytes === 0) return { crc: 0, bytes: 0 };
  const fd = openSync(item.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const stat = fstatSync(fd);
  if (!stat.isFile()) throw new Error("not a plain file");
  let crc = 0;
  let bytes = 0;
  const stream = createReadStream(item.file, { fd, start: 0, end: item.bytes - 1, autoClose: true });
  for await (const chunk of stream) {
    const data = chunk as Buffer;
    crc = crc32(data, crc);
    bytes += data.length;
    await write(res, data);
  }
  return { crc, bytes };
}

export async function writeWorkflowArchive(res: ServerResponse, plan: Extract<WorkflowArchivePlan, { ok: true }>): Promise<void> {
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of plan.entries) {
    const name = Buffer.from(entry.name, "utf8");
    const start = offset;
    await write(res, localHeader(name, entry.modifiedAt));
    await write(res, name);
    offset += 30 + name.length;
    const result = await writeEntryData(res, entry);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0);
    descriptor.writeUInt32LE(result.crc >>> 0, 4);
    descriptor.writeUInt32LE(result.bytes >>> 0, 8);
    descriptor.writeUInt32LE(result.bytes >>> 0, 12);
    await write(res, descriptor);
    offset += result.bytes + 16;
    const centralBytes = centralHeader(name, entry.modifiedAt, result.crc, result.bytes, start);
    central.push(centralBytes, name);
  }
  const directory = Buffer.concat(central);
  const directoryOffset = offset;
  if (directory.length > 0) await write(res, directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(plan.entries.length, 8);
  end.writeUInt16LE(plan.entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  await write(res, end);
}
