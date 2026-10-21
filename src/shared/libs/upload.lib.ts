
export type UploadKind = "pdf" | "png" | "jpeg" | "docx";

type UploadKindSpec = { label: string; extensions: string[]; contentType: string; signatures: number[][] };

export const UPLOAD_KINDS: Record<UploadKind, UploadKindSpec> = {
  pdf: { label: "PDF", extensions: ["pdf"], contentType: "application/pdf", signatures: [[0x25, 0x50, 0x44, 0x46, 0x2d]] },
  png: { label: "PNG", extensions: ["png"], contentType: "image/png", signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]] },
  jpeg: { label: "JPG", extensions: ["jpg", "jpeg"], contentType: "image/jpeg", signatures: [[0xff, 0xd8, 0xff]] },
  docx: {
    label: "Word (.docx)",
    extensions: ["docx"],
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signatures: [[0x50, 0x4b, 0x03, 0x04]],
  },
};

export const MB = 1024 * 1024;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}

export function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export function acceptOf(kinds: readonly UploadKind[]) {
  return kinds.flatMap((kind) => UPLOAD_KINDS[kind].extensions.map((extension) => `.${extension}`)).join(",");
}

export function kindLabels(kinds: readonly UploadKind[]) {
  return kinds.map((kind) => UPLOAD_KINDS[kind].label).join(", ");
}

export function matchesSignature(kind: UploadKind, head: Uint8Array) {
  return UPLOAD_KINDS[kind].signatures.some((signature) => signature.every((byte, index) => head[index] === byte));
}

export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).at(-1) ?? "";
  return base.normalize("NFC").replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

export type UploadCheck = { ok: true; name: string; kind: UploadKind; contentType: string } | { ok: false; message: string };

export function checkUpload(file: { name: string; size: number; head: Uint8Array }, options: { kinds: readonly UploadKind[]; maxBytes: number }): UploadCheck {
  const name = cleanFileName(file.name);
  if (!name) return { ok: false, message: "Tệp không có tên, đổi tên rồi chọn lại." };
  const extension = extensionOf(name);
  const kind = options.kinds.find((entry) => UPLOAD_KINDS[entry].extensions.includes(extension));
  if (!kind) return { ok: false, message: `Tệp ${name}: chỉ nhận ${kindLabels(options.kinds)}.` };
  if (file.size <= 0) return { ok: false, message: `Tệp ${name} rỗng, chọn tệp khác.` };
  if (file.size > options.maxBytes) return { ok: false, message: `Tệp ${name} nặng ${formatFileSize(file.size)}, tối đa ${formatFileSize(options.maxBytes)}.` };
  if (!matchesSignature(kind, file.head)) return { ok: false, message: `Tệp ${name} không phải tệp ${UPLOAD_KINDS[kind].label} thật (nội dung không khớp đuôi tệp).` };
  return { ok: true, name, kind, contentType: UPLOAD_KINDS[kind].contentType };
}

export async function inspectFile(file: Blob & { name: string }, options: { kinds: readonly UploadKind[]; maxBytes: number }) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return checkUpload({ name: file.name, size: file.size, head }, options);
}

export function contentDisposition(fileName: string, type: "attachment" | "inline" = "attachment") {
  const name = cleanFileName(fileName) || "tep";
  const ascii =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "tep";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
