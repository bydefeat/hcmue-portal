import type { CellValue, Workbook } from "exceljs";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function newWorkbook(): Promise<Workbook> {
  const loaded = await import("exceljs");
  const ExcelJS = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
  return new ExcelJS.Workbook();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateText(date: Date) {
  const day = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
  const hasTime = date.getUTCHours() + date.getUTCMinutes() + date.getUTCSeconds() > 0;
  return hasTime ? `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` : day;
}

export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return dateText(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  if (typeof value === "string" || typeof value === "boolean") return String(value).trim();
  if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if ("text" in value) return String(value.text).trim();
  if ("result" in value) return cellText((value.result ?? null) as CellValue);
  if ("error" in value) return "";
  return "";
}

export async function readSpreadsheet(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const workbook = await newWorkbook();
  await workbook.xlsx.load(data as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let index = 1; index <= row.cellCount; index++) cells.push(cellText(row.getCell(index).value));
    if (cells.some((cell) => cell !== "")) rows.push(cells);
  });
  return rows;
}

export type SpreadsheetColumn = { header: string; width?: number; text?: boolean };

export type SpreadsheetCell = string | number | null | { value: number; numFmt: string };

function cellLength(cell: SpreadsheetCell) {
  return String(cell !== null && typeof cell === "object" ? cell.value : (cell ?? "")).length;
}

export async function buildSpreadsheet(sheetName: string, columns: SpreadsheetColumn[], rows: SpreadsheetCell[][]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = await newWorkbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column, index) => {
    const longest = rows.reduce((max, row) => Math.max(max, cellLength(row[index] ?? null)), column.header.length);
    return { header: column.header, width: column.width ?? Math.min(60, Math.max(8, longest + 2)), style: column.text ? { numFmt: "@" } : {} };
  });
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => {
    const added = sheet.addRow(row.map((cell, index) => (cell !== null && typeof cell === "object" ? cell.value : columns[index]?.text && cell !== null ? String(cell) : cell)));
    row.forEach((cell, index) => {
      if (cell !== null && typeof cell === "object") added.getCell(index + 1).numFmt = cell.numFmt;
    });
  });
  if (rows.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Uint8Array.from(new Uint8Array(await workbook.xlsx.writeBuffer()));
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
