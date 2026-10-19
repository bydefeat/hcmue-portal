import "server-only";
import { mkdir, readdir, readFile as readFromDisk, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/shared/libs/env.lib";
import { newId } from "@/shared/libs/id.lib";
import { contentDisposition } from "@/shared/libs/upload.lib";

// Kho tệp tải lên. Hiện ghi trên đĩa cục bộ dưới DEFEAT_STORAGE_DIRECTORY; nơi gọi chỉ biết khóa (`requests/<uuid>`), không biết
// đường dẫn đĩa, nên đổi sang S3/R2 chỉ cần viết lại file này với cùng các hàm async.

export type StorageNamespace = "requests" | "exams";

const NAMESPACES: readonly StorageNamespace[] = ["requests", "exams"];

// Khóa luôn do server sinh: thư mục cố định + uuid. Không có dấu chấm, gạch chéo ngược hay tên tệp của người dùng nên không thoát
// ra ngoài thư mục lưu trữ được.
const KEY = /^(requests|exams)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class StorageKeyError extends Error {
  constructor(key: string) {
    super(`Khóa lưu trữ không hợp lệ: ${JSON.stringify(key)}`);
  }
}

export function isStorageKey(key: string) {
  return KEY.test(key);
}

export function newStorageKey(namespace: StorageNamespace, id = newId()) {
  const key = `${namespace}/${id.toLowerCase()}`;
  if (!isStorageKey(key)) throw new StorageKeyError(key);
  return key;
}

function root() {
  return path.resolve(env.DEFEAT_STORAGE_DIRECTORY);
}

function pathOf(key: string) {
  if (!isStorageKey(key)) throw new StorageKeyError(key);
  const base = root();
  const target = path.resolve(base, key);
  // Phòng thủ thêm: khóa đã qua regex nhưng vẫn kiểm đường dẫn cuối nằm trong thư mục gốc.
  if (!target.startsWith(base + path.sep)) throw new StorageKeyError(key);
  return target;
}

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

// Ghi ra tệp tạm rồi đổi tên: người đọc không bao giờ thấy tệp ghi dở.
export async function putFile(key: string, data: Uint8Array) {
  const target = pathOf(key);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${newId()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

// Không có tệp thì trả null để route tải xuống trả 404.
export async function readFile(key: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFromDisk(pathOf(key)));
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function deleteFile(key: string) {
  await rm(pathOf(key), { force: true });
}

// Xóa nhiều tệp, không ném lỗi: dùng để dọn sau khi giao dịch hỏng hoặc sau khi thay tệp. Tệp xóa không được thì tác vụ
// dọn tệp mồ côi (sweepOrphanFiles) xóa lần sau.
export async function deleteFiles(keys: string[]) {
  const results = await Promise.allSettled(keys.map((key) => deleteFile(key)));
  for (const result of results) if (result.status === "rejected") console.error("[storage] Không xóa được tệp:", result.reason);
}

export type StoredFile = { key: string; data: Uint8Array };

// Ghi tệp trước rồi mới chạy giao dịch ghi DB (không giữ giao dịch mở trong lúc ghi đĩa). Giao dịch hoặc lần ghi nào hỏng thì
// xóa mọi tệp vừa ghi rồi ném lỗi tiếp. Tiến trình chết giữa chừng vẫn có thể để lại tệp không dòng DB nào trỏ tới: tác vụ
// dọn tệp mồ côi xóa các tệp đó.
export async function withStoredFiles<T>(files: StoredFile[], work: () => Promise<T>): Promise<T> {
  const keys = files.map((file) => file.key);
  const written = await Promise.allSettled(files.map((file) => putFile(file.key, file.data)));
  const failed = written.find((result) => result.status === "rejected");
  if (failed) {
    await deleteFiles(keys);
    throw failed.reason;
  }
  try {
    return await work();
  } catch (error) {
    await deleteFiles(keys);
    throw error;
  }
}

export type StoredEntry = { key: string; modifiedAt: Date };

export async function listFiles(namespace: StorageNamespace): Promise<StoredEntry[]> {
  if (!NAMESPACES.includes(namespace)) throw new StorageKeyError(namespace);
  let names: string[];
  try {
    names = await readdir(path.join(root(), namespace));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const entries = await Promise.all(
    names
      .map((name) => `${namespace}/${name}`)
      .filter(isStorageKey)
      .map(async (key) => {
        try {
          return { key, modifiedAt: (await stat(pathOf(key))).mtime };
        } catch (error) {
          if (isMissing(error)) return null;
          throw error;
        }
      }),
  );
  return entries.filter((entry) => entry !== null);
}

// Xóa tệp trong thư mục không còn dòng DB nào trỏ tới. Chỉ xóa tệp cũ hơn `graceMs` để không đụng tệp vừa ghi mà giao dịch
// của nó chưa commit.
export async function sweepOrphanFiles(namespace: StorageNamespace, isReferenced: (keys: string[]) => Promise<Set<string>>, graceMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - graceMs;
  const candidates = (await listFiles(namespace)).filter((entry) => entry.modifiedAt.getTime() < cutoff).map((entry) => entry.key);
  if (candidates.length === 0) return 0;
  const referenced = await isReferenced(candidates);
  const orphans = candidates.filter((key) => !referenced.has(key));
  await deleteFiles(orphans);
  return orphans.length;
}

// Trả tệp cho route tải xuống: tên tệp gốc giữ dấu tiếng Việt, kiểu tệp đã kiểm lúc tải lên, không cho trình duyệt đoán kiểu
// và không lưu bộ nhớ đệm dùng chung (tệp riêng tư).
export function fileResponse(data: Uint8Array, file: { fileName: string; contentType: string }) {
  return new Response(new Blob([data as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": contentDisposition(file.fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function fileErrorResponse(status: 401 | 404, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
