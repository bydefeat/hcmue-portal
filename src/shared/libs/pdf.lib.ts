import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import PdfKitDocument from "pdfkit";
import { formatDateTime } from "@/shared/libs/date.lib";

export const PDF_MIME = "application/pdf";

export const SCHOOL_NAME = "Trường Đại học Sư phạm Thành phố Hồ Chí Minh";

export type PdfCell = string | number | null;
export type PdfColumn = { header: string; align?: "left" | "center" | "right"; minWidth?: number };
export type PdfRun = { text: string; bold?: boolean };

export type PdfBlock =
  | { type: "paragraph"; text: string | PdfRun[]; align?: "left" | "center" | "right" | "justify"; bold?: boolean; size?: number }
  | { type: "fields"; items: { label: string; value: string }[] }
  | { type: "table"; columns: PdfColumn[]; rows: PdfCell[][]; caption?: string; emptyText?: string }
  | { type: "signature"; place?: string; lines: string[]; name?: string }
  | { type: "space"; height?: number };

export type PdfDocumentInput = {
  title: string;
  subtitle?: string;
  parent?: string;
  unit?: string;
  reference?: string;
  motto?: boolean;
  dateLine?: string;
  hideExportedAt?: boolean;
  landscape?: boolean;
  exportedAt?: Date;
  blocks: PdfBlock[];
};

const FONT_DIRECTORY = path.join(process.cwd(), "src/shared/assets/fonts");
const REGULAR = "Inter";
const BOLD = "Inter-SemiBold";

let fontFiles: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts() {
  fontFiles ??= Promise.all([readFile(path.join(FONT_DIRECTORY, "Inter-Regular.otf")), readFile(path.join(FONT_DIRECTORY, "Inter-SemiBold.otf"))])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((error: unknown) => {
      fontFiles = null;
      throw error;
    });
  return fontFiles;
}

const COLOR = { text: "#111827", muted: "#4b5563", border: "#9ca3af", headerFill: "#e8eef5" };
const MARGIN = { top: 40, bottom: 44, left: 40, right: 40 };
const BODY_SIZE = 10;
const TABLE_SIZE = 9;
const CELL_PAD_X = 4;
const CELL_PAD_Y = 3;
const LINE_GAP = 1.5;

type Doc = PDFKit.PDFDocument;

function cellText(value: PdfCell) {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : value;
}

export function isNumericColumn(rows: PdfCell[][], index: number) {
  let seen = false;
  for (const row of rows) {
    const value = row[index];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "number" && !/^-?\d+([.,]\d+)?%?$/.test(value.trim())) return false;
    seen = true;
  }
  return seen;
}

class Layout {
  readonly left: number;
  readonly width: number;
  readonly bottom: number;
  y: number;

  constructor(readonly doc: Doc) {
    this.left = MARGIN.left;
    this.width = doc.page.width - MARGIN.left - MARGIN.right;
    this.bottom = doc.page.height - MARGIN.bottom;
    this.y = MARGIN.top;
  }

  newPage() {
    this.doc.addPage();
    this.y = MARGIN.top;
  }

  ensure(height: number) {
    if (this.y + height > this.bottom && this.y > MARGIN.top) this.newPage();
  }

  font(bold: boolean, size: number) {
    return this.doc.font(bold ? BOLD : REGULAR).fontSize(size);
  }

  text(value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions & { width: number }) {
    this.doc.fillColor(COLOR.text).text(value, x, y, { lineGap: LINE_GAP, height: this.bottom - y + 1, ...options });
  }

  heightOf(value: string, width: number, bold: boolean, size: number) {
    return this.font(bold, size).heightOfString(value || " ", { width, lineGap: LINE_GAP });
  }
}

function drawLetterhead(layout: Layout, input: PdfDocumentInput) {
  const { doc } = layout;
  const half = layout.width / 2;
  const leftWidth = input.motto ? half : layout.width;
  const align = input.motto ? "center" : "left";
  const top = layout.y;
  if (input.parent) {
    layout.font(false, 10);
    layout.text(input.parent.toUpperCase(), layout.left, top, { width: leftWidth, align });
  }
  layout.font(true, 10.5);
  layout.text("TRƯỜNG ĐẠI HỌC SƯ PHẠM", layout.left, input.parent ? doc.y : top, { width: leftWidth, align });
  layout.text("THÀNH PHỐ HỒ CHÍ MINH", layout.left, doc.y, { width: leftWidth, align });
  if (input.unit) {
    layout.font(false, 10);
    layout.text(input.unit.toUpperCase(), layout.left, doc.y, { width: leftWidth, align });
  }
  if (input.reference) {
    layout.font(false, 10);
    layout.text(input.reference, layout.left, doc.y + 4, { width: leftWidth, align });
  }
  const leftBottom = doc.y;
  let rightBottom = top;
  if (input.motto) {
    layout.font(true, 10.5);
    layout.text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", layout.left + half, top, { width: half, align: "center" });
    layout.text("Độc lập - Tự do - Hạnh phúc", layout.left + half, doc.y, { width: half, align: "center" });
    if (input.dateLine) {
      layout.font(false, 10);
      layout.text(input.dateLine, layout.left + half, doc.y + (input.parent ? 18 : 4), { width: half, align: "center" });
    }
    rightBottom = doc.y;
  }
  layout.y = Math.max(leftBottom, rightBottom) + 18;

  layout.font(true, 14);
  layout.text(input.title.toUpperCase(), layout.left, layout.y, { width: layout.width, align: "center" });
  layout.y = doc.y + 2;
  if (input.subtitle) {
    layout.font(false, BODY_SIZE);
    layout.text(input.subtitle, layout.left, layout.y, { width: layout.width, align: "center" });
    layout.y = doc.y;
  }
  if (!input.hideExportedAt) {
    layout.font(false, 8.5);
    doc.fillColor(COLOR.muted).text(`Ngày xuất: ${formatDateTime(input.exportedAt ?? new Date())}`, layout.left, layout.y + 2, {
      width: layout.width,
      align: "center",
      height: 20,
    });
  }
  layout.y = doc.y + 12;
}

function drawParagraph(layout: Layout, block: Extract<PdfBlock, { type: "paragraph" }>) {
  const { doc } = layout;
  const size = block.size ?? BODY_SIZE;
  const runs = typeof block.text === "string" ? [{ text: block.text, bold: block.bold }] : block.text;
  const plain = runs.map((run) => run.text).join("");
  const height = layout.heightOf(plain, layout.width, runs.some((run) => run.bold), size);
  layout.ensure(Math.min(height, (layout.bottom - MARGIN.top) / 2));
  runs.forEach((run, index) => {
    layout.font(Boolean(run.bold), size);
    const options = { width: layout.width, align: block.align ?? "left", lineGap: LINE_GAP, continued: index < runs.length - 1 };
    if (index === 0) doc.fillColor(COLOR.text).text(run.text, layout.left, layout.y, options);
    else doc.text(run.text, options);
  });
  layout.y = doc.y + 6;
}

function drawFields(layout: Layout, items: { label: string; value: string }[]) {
  const { doc } = layout;
  const columnWidth = layout.width / 2;
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    const height = Math.max(...pair.map((item) => layout.heightOf(`${item.label}: ${item.value}`, columnWidth - 8, true, BODY_SIZE)));
    layout.ensure(height);
    pair.forEach((item, column) => {
      const x = layout.left + column * columnWidth;
      layout.font(false, BODY_SIZE);
      doc.fillColor(COLOR.muted).text(`${item.label}: `, x, layout.y, { width: columnWidth - 8, lineGap: LINE_GAP, continued: true });
      layout.font(true, BODY_SIZE);
      doc.fillColor(COLOR.text).text(item.value || "—", { lineGap: LINE_GAP });
    });
    layout.y += height + 2;
  }
  layout.y += 6;
}

function columnWidths(layout: Layout, columns: PdfColumn[], rows: string[][]) {
  const natural = columns.map((column, index) => {
    const header = layout.font(true, TABLE_SIZE).widthOfString(column.header);
    layout.font(false, TABLE_SIZE);
    const body = rows.reduce((max, row) => Math.max(max, layout.doc.widthOfString(row[index] ?? "")), 0);
    return Math.max(Math.min(Math.max(header, body), layout.width) + CELL_PAD_X * 2 + 1, column.minWidth ?? 0);
  });
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= layout.width) return natural.map((width) => (width / total) * layout.width);
  const widths: (number | null)[] = natural.map(() => null);
  let remaining = layout.width;
  let changed = true;
  while (changed) {
    changed = false;
    const open = widths.map((width, index) => (width === null ? index : -1)).filter((index) => index >= 0);
    const share = remaining / open.length;
    for (const index of open) {
      if (natural[index] <= share) {
        widths[index] = natural[index];
        remaining -= natural[index];
        changed = true;
      }
    }
  }
  const open = widths.map((width, index) => (width === null ? index : -1)).filter((index) => index >= 0);
  const openNatural = open.reduce((sum, index) => sum + Math.sqrt(natural[index]), 0);
  for (const index of open) widths[index] = (Math.sqrt(natural[index]) / openNatural) * remaining;
  return widths as number[];
}

function drawTable(layout: Layout, block: Extract<PdfBlock, { type: "table" }>) {
  const { doc } = layout;
  const rows = block.rows.map((row) => block.columns.map((_, index) => cellText(row[index] ?? null)));
  const aligns = block.columns.map((column, index) => column.align ?? (isNumericColumn(block.rows, index) ? "right" : "left"));
  const widths = columnWidths(layout, block.columns, rows);
  const maxRowHeight = layout.bottom - MARGIN.top - 40;

  const rowHeight = (cells: string[], bold: boolean) =>
    Math.min(maxRowHeight, Math.max(...cells.map((cell, index) => layout.heightOf(cell, widths[index] - CELL_PAD_X * 2, bold, TABLE_SIZE))) + CELL_PAD_Y * 2);

  const drawRow = (cells: string[], height: number, header: boolean) => {
    let x = layout.left;
    if (header) doc.rect(layout.left, layout.y, layout.width, height).fill(COLOR.headerFill);
    cells.forEach((cell, index) => {
      layout.font(header, TABLE_SIZE);
      layout.text(cell, x + CELL_PAD_X, layout.y + CELL_PAD_Y, {
        width: widths[index] - CELL_PAD_X * 2,
        height: height - CELL_PAD_Y * 2 + 1,
        align: aligns[index],
        features: !header && aligns[index] === "right" ? ["tnum"] : undefined,
        ellipsis: true,
      });
      doc.lineWidth(0.5).strokeColor(COLOR.border).rect(x, layout.y, widths[index], height).stroke();
      x += widths[index];
    });
    layout.y += height;
  };

  const headerCells = block.columns.map((column) => column.header);
  const headerHeight = rowHeight(headerCells, true);
  const firstRowHeight = rows[0] ? rowHeight(rows[0], false) : 0;
  const captionHeight = block.caption ? layout.heightOf(block.caption, layout.width, true, BODY_SIZE) + 4 : 0;
  layout.ensure(captionHeight + headerHeight + firstRowHeight);
  if (block.caption) {
    layout.font(true, BODY_SIZE);
    layout.text(block.caption, layout.left, layout.y, { width: layout.width });
    layout.y = doc.y + 4;
  }
  drawRow(headerCells, headerHeight, true);
  if (rows.length === 0) {
    const empty = block.emptyText ?? "Không có dữ liệu.";
    const height = layout.heightOf(empty, layout.width - CELL_PAD_X * 2, false, TABLE_SIZE) + CELL_PAD_Y * 2;
    layout.font(false, TABLE_SIZE);
    doc.fillColor(COLOR.muted).text(empty, layout.left + CELL_PAD_X, layout.y + CELL_PAD_Y, { width: layout.width - CELL_PAD_X * 2, align: "center", height });
    doc.lineWidth(0.5).strokeColor(COLOR.border).rect(layout.left, layout.y, layout.width, height).stroke();
    layout.y += height;
  }
  for (const cells of rows) {
    const height = rowHeight(cells, false);
    if (layout.y + height > layout.bottom) {
      layout.newPage();
      drawRow(headerCells, headerHeight, true);
    }
    drawRow(cells, height, false);
  }
  layout.y += 10;
}

function drawSignature(layout: Layout, block: Extract<PdfBlock, { type: "signature" }>) {
  const { doc } = layout;
  const width = 230;
  const x = layout.left + layout.width - width;
  const lines = block.place ? [block.place, ...block.lines] : block.lines;
  const height = lines.length * 14 + (block.name ? 64 : 0);
  layout.ensure(height);
  lines.forEach((line, index) => {
    layout.font(!(block.place && index === 0), BODY_SIZE);
    layout.text(line, x, layout.y, { width, align: "center" });
    layout.y = doc.y + 1;
  });
  if (block.name) {
    layout.y += 48;
    layout.font(true, BODY_SIZE);
    layout.text(block.name, x, layout.y, { width, align: "center" });
    layout.y = doc.y;
  }
  layout.y += 8;
}

function drawFooters(doc: Doc, title: string) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN.bottom + 16;
    const width = doc.page.width - MARGIN.left - MARGIN.right;
    doc.font(REGULAR).fontSize(8).fillColor(COLOR.muted);
    doc.text(title, MARGIN.left, y, { width: width - 80, lineBreak: false, ellipsis: true, height: 12 });
    doc.text(`Trang ${index - range.start + 1}/${range.count}`, MARGIN.left + width - 80, y, { width: 80, align: "right", lineBreak: false, height: 12 });
    doc.page.margins.bottom = bottom;
  }
}

export async function buildPdf(input: PdfDocumentInput): Promise<Uint8Array<ArrayBuffer>> {
  const fonts = await loadFonts();
  const landscape = input.landscape ?? input.blocks.some((block) => block.type === "table" && block.columns.length > 6);
  const exportedAt = input.exportedAt ?? new Date();
  const doc = new PdfKitDocument({
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
    margins: MARGIN,
    bufferPages: true,
    autoFirstPage: true,
    font: fonts.regular as unknown as string,
    lang: "vi-VN",
    displayTitle: true,
    info: { Title: input.title, Author: SCHOOL_NAME, Creator: "HCMUE Portal", CreationDate: exportedAt },
  });
  doc.registerFont(REGULAR, fonts.regular);
  doc.registerFont(BOLD, fonts.bold);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const layout = new Layout(doc);
  drawLetterhead(layout, { ...input, exportedAt });
  for (const block of input.blocks) {
    if (block.type === "paragraph") drawParagraph(layout, block);
    else if (block.type === "fields") drawFields(layout, block.items);
    else if (block.type === "table") drawTable(layout, block);
    else if (block.type === "signature") drawSignature(layout, block);
    else layout.y += block.height ?? 10;
  }
  drawFooters(doc, `${SCHOOL_NAME} · ${input.title}`);
  doc.end();
  const buffer = await done;
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
}

export function buildTablePdf(input: { title: string; subtitle?: string; header: string[]; rows: PdfCell[][]; unit?: string; exportedAt?: Date }) {
  return buildPdf({
    title: input.title,
    subtitle: input.subtitle,
    unit: input.unit,
    exportedAt: input.exportedAt,
    blocks: [{ type: "table", columns: input.header.map((header) => ({ header })), rows: input.rows }],
  });
}
