
function utf16Hex(text: string) {
  let hex = "FEFF";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    hex += (code > 0xffff ? 0x3f : code).toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

function asciiText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, (char) => `\\${char}`);
}

export function samplePdf(fileName: string) {
  const lines = ["Tep mau - du lieu mau HCMUE Portal", asciiText(fileName), "Khong co noi dung that."];
  const stream = ["BT", "/F1 14 Tf", "72 760 Td", ...lines.flatMap((line, index) => (index === 0 ? [`(${line}) Tj`] : ["0 -22 Td", `(${line}) Tj`])), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Title ${utf16Hex(`Tệp mẫu: ${fileName}`)} /Producer (HCMUE Portal seed) >>`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
