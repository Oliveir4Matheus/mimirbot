import { describe, expect, it } from "vitest";
import { parseSharedStrings, parseSheetRows, readXlsxWorkbook, xmlAttribute, xmlTextElements } from "./xlsx";

function write16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function write32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function storedZip(files: Array<[string, string]>): Uint8Array {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const central: number[] = [];
  for (const [name, text] of files) {
    const nameBytes = [...encoder.encode(name)];
    const data = [...encoder.encode(text)];
    const offset = output.length;
    write32(output, 0x04034b50);
    write16(output, 20);
    write16(output, 0);
    write16(output, 0);
    write32(output, 0);
    write32(output, 0);
    write32(output, data.length);
    write32(output, data.length);
    write16(output, nameBytes.length);
    write16(output, 0);
    output.push(...nameBytes, ...data);

    write32(central, 0x02014b50);
    write16(central, 20);
    write16(central, 20);
    write16(central, 0);
    write16(central, 0);
    write32(central, 0);
    write32(central, 0);
    write32(central, data.length);
    write32(central, data.length);
    write16(central, nameBytes.length);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write16(central, 0);
    write32(central, 0);
    write32(central, offset);
    central.push(...nameBytes);
  }
  const centralOffset = output.length;
  output.push(...central);
  write32(output, 0x06054b50);
  write16(output, 0);
  write16(output, 0);
  write16(output, files.length);
  write16(output, files.length);
  write32(output, central.length);
  write32(output, centralOffset);
  write16(output, 0);
  return new Uint8Array(output);
}

const workbookXml = `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Data" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const relsXml = `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;
const sharedXml = `<sst><si><t>Name</t></si><si><t>Amount</t></si><si><t>Alpha &amp; Co</t></si><si><t>10</t></si></sst>`;
const sheet1Xml = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10</v></c></row></sheetData></worksheet>`;
const sheet2Xml = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Only</t></is></c></row></sheetData></worksheet>`;

describe("xlsx xml helpers", () => {
  it("reads attributes and text runs", () => {
    expect(xmlAttribute('<sheet name="Summary" r:id="rId1"/>', "name")).toBe("Summary");
    expect(xmlAttribute('<sheet name="Summary" r:id="rId1"/>', "r:id")).toBe("rId1");
    expect(xmlTextElements("<si><r><t>Al</t></r><r><t>pha</t></r></si>")).toBe("Alpha");
  });

  it("decodes shared strings", () => {
    expect(parseSharedStrings(sharedXml)).toEqual(["Name", "Amount", "Alpha & Co", "10"]);
  });

  it("keeps sparse cells aligned", () => {
    expect(parseSheetRows('<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row>', []))
      .toEqual([["a", "", "c"]]);
  });
});

describe("xlsx workbook", () => {
  it("reads sheet names, shared strings and inline strings from a zip", async () => {
    const bytes = storedZip([
      ["xl/workbook.xml", workbookXml],
      ["xl/_rels/workbook.xml.rels", relsXml],
      ["xl/sharedStrings.xml", sharedXml],
      ["xl/worksheets/sheet1.xml", sheet1Xml],
      ["xl/worksheets/sheet2.xml", sheet2Xml],
    ]);
    const workbook = await readXlsxWorkbook(bytes);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["Summary", "Data"]);
    expect(workbook.sheets[0]).toEqual({ name: "Summary", headers: ["Name", "Amount"], rows: [["Alpha & Co", "10"]] });
    expect(workbook.sheets[1]).toEqual({ name: "Data", headers: ["Only"], rows: [] });
  });

  it("refuses a file that is not a zip", async () => {
    await expect(readXlsxWorkbook(new TextEncoder().encode("not a workbook"))).rejects.toThrow("xlsx: not a zip archive");
  });
});
