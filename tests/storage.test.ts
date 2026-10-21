import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type * as StorageLib from "@/shared/libs/storage.lib";
import { checkUpload, cleanFileName, contentDisposition, formatFileSize, matchesSignature } from "@/shared/libs/upload.lib";

let directory = "";
let storage: typeof StorageLib;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "hcmue-storage-test-"));
  process.env.DEFEAT_STORAGE_DIRECTORY = directory;
  storage = await import("@/shared/libs/storage.lib");
});

after(() => rm(directory, { recursive: true, force: true }));

describe("storage: ghi, đọc, xóa", () => {
  test("ghi rồi đọc lại đúng nội dung, xóa thì đọc ra null, xóa lần nữa không lỗi", async () => {
    const key = storage.newStorageKey("requests");
    assert.match(key, /^requests\/[0-9a-f-]{36}$/);
    const data = new TextEncoder().encode("%PDF-1.4 nội dung");
    await storage.putFile(key, data);
    assert.deepEqual(await storage.readFile(key), data);
    assert.deepEqual(await readdir(path.join(directory, "requests")), [key.split("/")[1]]);
    await storage.deleteFile(key);
    assert.equal(await storage.readFile(key), null);
    await storage.deleteFile(key);
  });

  test("chặn khóa xấu: thoát thư mục, đường dẫn tuyệt đối, thư mục lạ, tên tệp người dùng", async () => {
    for (const key of ["../x", "requests/../../etc/passwd", "/etc/passwd", "requests/giay.pdf", "other/0192f3a4-0000-7000-8000-000000000001", "requests\\..\\x", ""]) {
      assert.equal(storage.isStorageKey(key), false, key);
      await assert.rejects(storage.readFile(key), storage.StorageKeyError);
      await assert.rejects(storage.putFile(key, new Uint8Array([1])), storage.StorageKeyError);
      await assert.rejects(storage.deleteFile(key), storage.StorageKeyError);
    }
    assert.throws(() => storage.newStorageKey("requests", "../x"), storage.StorageKeyError);
  });

  test("giao dịch hỏng thì tệp vừa ghi bị xóa; thành công thì giữ", async () => {
    const kept = { key: storage.newStorageKey("exams"), data: new Uint8Array([1, 2, 3]) };
    assert.equal(await storage.withStoredFiles([kept], async () => "ok"), "ok");
    assert.deepEqual(await storage.readFile(kept.key), kept.data);
    const dropped = [1, 2].map(() => ({ key: storage.newStorageKey("exams"), data: new Uint8Array([9]) }));
    await assert.rejects(
      storage.withStoredFiles(dropped, async () => {
        throw new Error("giao dịch hỏng");
      }),
      /giao dịch hỏng/,
    );
    for (const file of dropped) assert.equal(await storage.readFile(file.key), null);
  });

  test("dọn tệp mồ côi: chỉ xóa tệp cũ không còn được trỏ tới, bỏ qua tệp lạ trong thư mục", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const referenced = storage.newStorageKey("requests");
    const orphan = storage.newStorageKey("requests");
    const fresh = storage.newStorageKey("requests");
    for (const key of [referenced, orphan, fresh]) await storage.putFile(key, new Uint8Array([7]));
    for (const key of [referenced, orphan]) await utimes(path.join(directory, key), old, old);
    await writeFile(path.join(directory, "requests", "khong-phai-khoa.txt"), "x");
    const removed = await storage.sweepOrphanFiles("requests", async (keys) => new Set(keys.filter((key) => key === referenced)));
    assert.equal(removed, 1);
    assert.equal(await storage.readFile(orphan), null);
    assert.ok(await storage.readFile(referenced));
    assert.ok(await storage.readFile(fresh));
  });

  test("route tải xuống: tên gốc tiếng Việt, kiểu đã lưu, không cache, không đoán kiểu", async () => {
    const response = storage.fileResponse(new Uint8Array([37, 80, 68, 70]), { fileName: "Giấy xác nhận.pdf", contentType: "application/pdf" });
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="Giay xac nhan.pdf"; filename*=UTF-8''Gi%E1%BA%A5y%20x%C3%A1c%20nh%E1%BA%ADn.pdf`);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([37, 80, 68, 70]));
  });
});

describe("upload: kiểm loại tệp", () => {
  const pdfHead = new TextEncoder().encode("%PDF-1.7");
  const options = { kinds: ["pdf", "png", "jpeg", "docx"] as const, maxBytes: 1024 };

  test("chữ ký đầu tệp của PDF, PNG, JPG, docx", () => {
    assert.ok(matchesSignature("pdf", pdfHead));
    assert.ok(matchesSignature("png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
    assert.ok(matchesSignature("jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])));
    assert.ok(matchesSignature("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04])));
    assert.ok(!matchesSignature("png", pdfHead));
    assert.ok(!matchesSignature("pdf", new Uint8Array([])));
  });

  test("đuôi và nội dung phải khớp, kiểu tệp lấy theo danh sách cho phép", () => {
    assert.deepEqual(checkUpload({ name: "a.JPG", size: 10, head: new Uint8Array([0xff, 0xd8, 0xff]) }, options), {
      ok: true,
      name: "a.JPG",
      kind: "jpeg",
      contentType: "image/jpeg",
    });
    assert.ok(!checkUpload({ name: "a.png", size: 10, head: pdfHead }, options).ok);
    assert.ok(!checkUpload({ name: "a.html", size: 10, head: pdfHead }, options).ok);
    assert.ok(!checkUpload({ name: "khong-duoi", size: 10, head: pdfHead }, options).ok);
    assert.ok(!checkUpload({ name: "a.pdf", size: 1025, head: pdfHead }, options).ok);
    assert.ok(!checkUpload({ name: "a.pdf", size: 0, head: pdfHead }, options).ok);
    assert.ok(!checkUpload({ name: "   ", size: 10, head: pdfHead }, options).ok);
  });

  test("tên tệp: bỏ đường dẫn, ký tự điều khiển; giữ dấu tiếng Việt", () => {
    assert.equal(cleanFileName("C:\\Users\\an\\Đơn xin  hoãn.pdf"), "Đơn xin hoãn.pdf");
    assert.equal(cleanFileName("../../etc/passwd"), "passwd");
    assert.equal(cleanFileName("a\u0000b\nc.pdf"), "abc.pdf");
    assert.match(contentDisposition('tệp "lạ".pdf'), /^attachment; filename="tep _la_.pdf"; filename\*=UTF-8''t%E1%BB%87p%20%22l%E1%BA%A1%22\.pdf$/);
    assert.equal(formatFileSize(10 * 1024 * 1024), "10,0 MB");
  });
});
