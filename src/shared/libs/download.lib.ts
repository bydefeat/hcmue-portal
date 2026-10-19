// Tải tệp tạo ngay trên trình duyệt. CSV có BOM để Excel đọc đúng tiếng Việt.
export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([type.startsWith("text/csv") ? `﻿${content}` : content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

// Đọc CSV do Excel hoặc toCsv xuất: bỏ BOM, nhận ô có dấu phẩy, xuống dòng hoặc "" nằm trong ngoặc kép.
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
