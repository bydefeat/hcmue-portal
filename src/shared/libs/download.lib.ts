export function downloadFile(name: string, content: string | Uint8Array<ArrayBuffer>, type = "text/csv;charset=utf-8") {
  const part = typeof content === "string" && type.startsWith("text/csv") ? `﻿${content}` : content;
  const url = URL.createObjectURL(new Blob([part], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadBase64(name: string, base64: string, type: string) {
  downloadFile(name, Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)), type);
}

function csvCell(value: string | number) {
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length > 0) rows.push([...row, cell]);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}
