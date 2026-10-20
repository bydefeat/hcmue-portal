import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type * as ActionLib from "@/shared/libs/action.lib";
import type * as StorageLib from "@/shared/libs/storage.lib";
import type * as VirusScanLib from "@/shared/libs/virus-scan.lib";

// ---- máy chủ giả lập dùng trong file này ----

// clamd giả lập trong test: hiểu lệnh zINSTREAM/nINSTREAM (khúc <độ dài 4 byte big-endian><dữ liệu>, kết thúc bằng khúc 0),
// ghép lại toàn bộ dữ liệu, có chuỗi EICAR thì trả "stream: Eicar-Test-Signature FOUND", không thì "stream: OK".
// Chế độ "silent" nhận hết nhưng không trả lời (giả clamd treo), "drop" đóng kết nối ngay (giả clamd sập giữa chừng).

// Chuỗi kiểm thử chuẩn EICAR, ghép từ hai nửa để chính file test không bị phần mềm diệt virus trên máy dev xóa.
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");

type FakeClamd = {
  port: number;
  mode: "ok" | "silent" | "drop";
  scanned: { bytes: number; chunks: number; command: string }[];
  close: () => Promise<void>;
};

async function startFakeClamd(): Promise<FakeClamd> {
  const sockets = new Set<Socket>();
  const state: FakeClamd = { port: 0, mode: "ok", scanned: [], close: async () => {} };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    if (state.mode === "drop") {
      socket.destroy();
      return;
    }
    let buffer = Buffer.alloc(0);
    let command: string | null = null;
    const parts: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (command === null) {
        const end = buffer.findIndex((byte, index) => index > 0 && (byte === 0 || byte === 0x0a));
        if (end < 0) return;
        command = buffer.subarray(0, end).toString("utf8");
        buffer = buffer.subarray(end + 1);
        if (command !== "zINSTREAM" && command !== "nINSTREAM") {
          socket.end("UNKNOWN COMMAND\0");
          return;
        }
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (size === 0) {
          const data = Buffer.concat(parts);
          state.scanned.push({ bytes: data.length, chunks: parts.length, command });
          if (state.mode === "silent") return;
          const infected = data.includes(Buffer.from(EICAR, "latin1"));
          socket.end(infected ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          return;
        }
        if (buffer.length < 4 + size) return;
        parts.push(Buffer.from(buffer.subarray(4, 4 + size)));
        buffer = buffer.subarray(4 + size);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.port = (server.address() as AddressInfo).port;
  state.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    });
  return state;
}


// Quét virus khi tải lên với clamd giả (tests/support/fake-clamd.ts). Kho tệp trỏ vào thư mục tạm riêng; biến môi trường
// đặt trước khi nạp env.lib nên phải import động.
let clamd: FakeClamd;
let directory = "";
let storage: typeof StorageLib;
let scan: typeof VirusScanLib;
let action: typeof ActionLib;

before(async () => {
  clamd = await startFakeClamd();
  directory = await mkdtemp(path.join(tmpdir(), "hcmue-virus-scan-test-"));
  Object.assign(process.env, { DEFEAT_STORAGE_DRIVER: "local", DEFEAT_STORAGE_DIRECTORY: directory, DEFEAT_CLAMAV_HOST: "127.0.0.1", DEFEAT_CLAMAV_PORT: String(clamd.port) });
  storage = await import("@/shared/libs/storage.lib");
  scan = await import("@/shared/libs/virus-scan.lib");
  action = await import("@/shared/libs/action.lib");
});

after(async () => {
  await clamd.close();
  await rm(directory, { recursive: true, force: true });
});

const pdf = (bytes: number, tail = "") => {
  const data = new Uint8Array(bytes + tail.length).fill(0x20);
  data.set(new TextEncoder().encode("%PDF-1.7\n"), 0);
  data.set(new TextEncoder().encode(tail), bytes);
  return data;
};

const storedFiles = async () => (await readdir(directory, { recursive: true })).filter((name) => name.includes("-"));

async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe("virus-scan: giao thức clamd INSTREAM", () => {
  test("tệp sạch: OK; tệp lớn gửi thành nhiều khúc 64 KB, clamd ghép lại đủ byte", async () => {
    const config = { host: "127.0.0.1", port: clamd.port };
    assert.deepEqual(await scan.clamdScan(pdf(1000), config), { clean: true });
    const big = pdf(200 * 1024);
    assert.deepEqual(await scan.clamdScan(big, config), { clean: true });
    const last = clamd.scanned.at(-1)!;
    assert.equal(last.command, "zINSTREAM");
    assert.equal(last.bytes, big.byteLength);
    assert.equal(last.chunks, 4);
  });

  test("chuỗi EICAR: phát hiện cả khi nằm vắt qua ranh giới hai khúc", async () => {
    const config = { host: "127.0.0.1", port: clamd.port };
    assert.deepEqual(await scan.clamdScan(new TextEncoder().encode(EICAR), config), { clean: false, signature: "Eicar-Test-Signature" });
    const straddling = pdf(64 * 1024 - 20, EICAR);
    assert.deepEqual(await scan.clamdScan(straddling, config), { clean: false, signature: "Eicar-Test-Signature" });
  });

  test("đọc câu trả lời: OK, FOUND, lỗi của clamd thì ném", () => {
    assert.deepEqual(scan.parseClamdReply("stream: OK\0"), { clean: true });
    assert.deepEqual(scan.parseClamdReply("stream: Win.Test.EICAR_HDB-1 FOUND\0"), { clean: false, signature: "Win.Test.EICAR_HDB-1" });
    assert.throws(() => scan.parseClamdReply("INSTREAM size limit exceeded. ERROR\0"), /clamd trả lời lạ/);
  });

  test("clamd treo hoặc không mở cổng: ném lỗi chứ không coi là sạch", async () => {
    clamd.mode = "silent";
    try {
      await assert.rejects(scan.clamdScan(pdf(100), { host: "127.0.0.1", port: clamd.port, timeoutMs: 200 }), /không trả lời kịp/);
    } finally {
      clamd.mode = "ok";
    }
    await assert.rejects(scan.clamdScan(pdf(100), { host: "127.0.0.1", port: await closedPort(), timeoutMs: 2000 }), /ECONNREFUSED/);
  });
});

describe("virus-scan: tải lên qua withStoredFiles", () => {
  test("có một tệp nhiễm: từ chối với câu tiếng Việt nêu tên tệp, ghi log, không ghi tệp nào vào kho", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    let ran = false;
    const files = [
      { key: storage.newStorageKey("exams"), data: pdf(500), name: "Đề thi.pdf" },
      { key: storage.newStorageKey("exams"), data: pdf(500, EICAR), name: "Đáp án.pdf" },
    ];
    const error = await storage
      .withStoredFiles(files, async () => {
        ran = true;
      })
      .catch((caught: unknown) => caught);
    assert.ok(error instanceof scan.UploadRejectedError);
    assert.equal(error.message, "Tệp Đáp án.pdf chứa mã độc (Eicar-Test-Signature), hệ thống không nhận. Quét virus máy của bạn rồi chọn tệp khác.");
    assert.equal(ran, false);
    assert.deepEqual(await storedFiles(), []);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[1]), /Eicar-Test-Signature/);
    // Server action trả nguyên câu báo cho form.
    assert.deepEqual(action.actionFailure(error), { ok: false, message: error.message, fieldErrors: undefined });
  });

  test("tệp sạch: ghi vào kho như thường", async () => {
    const file = { key: storage.newStorageKey("requests"), data: pdf(300), name: "Giấy xác nhận.pdf" };
    assert.equal(await storage.withStoredFiles([file], async () => "ok"), "ok");
    assert.deepEqual(await storage.readFile(file.key), file.data);
    await storage.deleteFile(file.key);
  });

  test("đã cấu hình mà clamd không phản hồi: từ chối tải lên (fail-closed), không ghi tệp", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    clamd.mode = "drop";
    try {
      const file = { key: storage.newStorageKey("exams"), data: pdf(300), name: "Đề thi.pdf" };
      const error = await storage.withStoredFiles([file], async () => "ok").catch((caught: unknown) => caught);
      assert.ok(error instanceof scan.UploadRejectedError);
      assert.equal(error.message, scan.SCAN_UNAVAILABLE_MESSAGE);
      assert.match(error.message, /chưa quét được tệp, thử lại sau/);
      assert.deepEqual(await storedFiles(), []);
      assert.ok(logged.mock.callCount() >= 1);
    } finally {
      clamd.mode = "ok";
    }
    const down = await scan.assertCleanUpload({ data: pdf(10) }, { host: "127.0.0.1", port: await closedPort() }).catch((caught: unknown) => caught);
    assert.ok(down instanceof scan.UploadRejectedError && down.message === scan.SCAN_UNAVAILABLE_MESSAGE);
  });

  test("chưa cấu hình clamd: không quét, không mở kết nối", async () => {
    const scannedBefore = clamd.scanned.length;
    await scan.assertCleanUpload({ data: new TextEncoder().encode(EICAR) }, null);
    assert.equal(clamd.scanned.length, scannedBefore);
  });
});
