export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  dataOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (readUint32(bytes, offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("xlsx: not a zip archive");
}

export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const end = findEndOfCentralDirectory(bytes);
  const count = readUint16(bytes, end + 10);
  let offset = readUint32(bytes, end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (readUint32(bytes, offset) !== CENTRAL_SIGNATURE) throw new Error("xlsx: damaged central directory");
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (readUint32(bytes, localOffset) !== LOCAL_SIGNATURE) throw new Error("xlsx: damaged local header");
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    entries.push({
      name,
      method,
      compressedSize,
      dataOffset: localOffset + 30 + localNameLength + localExtraLength,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (compressed.byteLength > MAX_UNCOMPRESSED_BYTES) throw new Error("xlsx: entry too large");
  const data = entry.method === 0 ? compressed : entry.method === 8 ? await inflateRaw(compressed) : null;
  if (!data) throw new Error("xlsx: unsupported compression");
  if (data.byteLength > MAX_UNCOMPRESSED_BYTES) throw new Error("xlsx: entry too large");
  return new TextDecoder().decode(data);
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return "\"";
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function xmlAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match ? decodeXmlText(match[1]!) : null;
}

export function xmlTextElements(source: string): string {
  return [...source.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
    .map((match) => decodeXmlText(match[1]!))
    .join("");
}

export function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => xmlTextElements(match[1]!));
}

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/i.exec(reference)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

export function parseSheetRows(xml: string, sharedStrings: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = xmlAttribute(attributes, "r") ?? "";
      const type = xmlAttribute(attributes, "t") ?? "";
      const index = reference ? columnIndex(reference) : cells.length;
      let value = "";
      if (type === "inlineStr") {
        value = xmlTextElements(body);
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1];
        if (raw !== undefined) {
          const decoded = decodeXmlText(raw);
          value = type === "s" ? sharedStrings[Number(decoded)] ?? "" : decoded;
        }
      }
      cells[index] = value;
    }
    for (let index = 0; index < cells.length; index += 1) cells[index] ??= "";
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["xl", ...target.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function parseWorkbookSheets(workbook: string, relationships: string | undefined): Array<{ name: string; path: string }> {
  const targets = new Map<string, string>();
  if (relationships) {
    for (const match of relationships.matchAll(/<Relationship\b[^>]*>/gi)) {
      const tag = match[0];
      const id = xmlAttribute(tag, "Id");
      const target = xmlAttribute(tag, "Target");
      if (id && target && /worksheet/i.test(xmlAttribute(tag, "Type") ?? "")) targets.set(id, resolveTarget(target));
    }
  }
  return [...workbook.matchAll(/<sheet\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0];
    const name = xmlAttribute(tag, "name");
    const id = xmlAttribute(tag, "r:id");
    const target = id ? targets.get(id) : undefined;
    return name && target ? [{ name, path: target }] : [];
  });
}

export async function readXlsxWorkbook(bytes: Uint8Array): Promise<XlsxWorkbook> {
  const entries = new Map(zipEntries(bytes).map((entry) => [entry.name, entry]));
  const workbookEntry = entries.get("xl/workbook.xml");
  if (!workbookEntry) throw new Error("xlsx: missing workbook");
  const workbook = await readZipText(bytes, workbookEntry);
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  const relationships = relsEntry ? await readZipText(bytes, relsEntry) : undefined;
  const sharedEntry = entries.get("xl/sharedStrings.xml");
  const sharedStrings = parseSharedStrings(sharedEntry ? await readZipText(bytes, sharedEntry) : undefined);
  const sheets: XlsxSheet[] = [];
  for (const sheet of parseWorkbookSheets(workbook, relationships)) {
    const entry = entries.get(sheet.path);
    if (!entry) continue;
    const rows = parseSheetRows(await readZipText(bytes, entry), sharedStrings);
    const [headers = [], ...body] = rows;
    sheets.push({ name: sheet.name, headers, rows: body });
  }
  return { sheets };
}
