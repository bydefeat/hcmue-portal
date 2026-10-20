import "server-only";
import { connect } from "node:net";
import { env } from "@/shared/libs/env.lib";

// Quét virus tệp tải lên bằng clamd (ClamAV) qua TCP, lệnh INSTREAM: gửi "zINSTREAM\0", rồi từng khúc <độ dài 4 byte big-endian>
// <dữ liệu>, kết thúc bằng khúc độ dài 0; clamd trả "stream: OK" hoặc "stream: <tên mẫu> FOUND" (kết thúc bằng \0).

// Tệp bị từ chối vì lý do người dùng cần biết (có mã độc, chưa quét được): action trả nguyên câu báo này cho form.
export class UploadRejectedError extends Error {}

export type ClamdConfig = { host: string; port: number; timeoutMs?: number };

export type ScanResult = { clean: true } | { clean: false; signature: string };

const CHUNK_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

export const SCAN_UNAVAILABLE_MESSAGE = "Hệ thống chưa quét được tệp, thử lại sau ít phút.";

export function parseClamdReply(reply: string): ScanResult {
  const text = reply.replace(/\0+$/, "").trim();
  if (text === "stream: OK") return { clean: true };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found) return { clean: false, signature: found[1] };
  // "INSTREAM size limit exceeded. ERROR", lỗi khác: coi như chưa quét được.
  throw new Error(`clamd trả lời lạ: ${text.slice(0, 200)}`);
}

// Không có trả lời trọn vẹn (mất kết nối, hết giờ, clamd đóng giữa chừng) thì ném lỗi, nơi gọi từ chối tệp.
export function clamdScan(data: Uint8Array, config: ClamdConfig): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: config.host, port: config.port });
    const received: Buffer[] = [];
    let settled = false;
    const finish = (error: Error | null, result?: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result!);
    };
    const reply = () => Buffer.concat(received).toString("utf8");
    socket.setTimeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => finish(new Error("clamd không trả lời kịp")));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.byteLength; offset += CHUNK_BYTES) {
        const part = data.subarray(offset, offset + CHUNK_BYTES);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.byteLength);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk: Buffer) => {
      received.push(chunk);
      if (!chunk.includes(0)) return;
      try {
        finish(null, parseClamdReply(reply()));
      } catch (error) {
        finish(error as Error);
      }
    });
    // clamd có thể gửi lỗi rồi đóng trước khi nhận hết dữ liệu (ghi tiếp bị EPIPE): ưu tiên câu trả lời đã nhận.
    const closed = (error?: Error) => {
      if (received.length > 0) {
        try {
          return finish(null, parseClamdReply(reply()));
        } catch (parseError) {
          return finish(parseError as Error);
        }
      }
      finish(error ?? new Error("clamd đóng kết nối, không trả lời"));
    };
    socket.on("error", closed);
    socket.on("close", () => closed());
  });
}

export function virusScanConfig(): ClamdConfig | null {
  return env.DEFEAT_CLAMAV_HOST ? { host: env.DEFEAT_CLAMAV_HOST, port: env.DEFEAT_CLAMAV_PORT } : null;
}

// Quét một tệp người dùng tải lên trước khi ghi vào kho. Chưa cấu hình clamd thì bỏ qua; đã cấu hình mà clamd không trả lời
// thì từ chối (không cho tệp chưa quét lọt vào kho).
export async function assertCleanUpload(file: { data: Uint8Array; name?: string; key?: string }, config = virusScanConfig()) {
  if (!config) return;
  let result: ScanResult;
  try {
    result = await clamdScan(file.data, config);
  } catch (error) {
    console.error("[virus-scan] Không quét được tệp:", (error as Error).message);
    throw new UploadRejectedError(SCAN_UNAVAILABLE_MESSAGE);
  }
  if (result.clean) return;
  console.warn("[virus-scan] Phát hiện mã độc, từ chối tệp:", JSON.stringify({ signature: result.signature, name: file.name ?? null, key: file.key ?? null, bytes: file.data.byteLength }));
  throw new UploadRejectedError(`${file.name ? `Tệp ${file.name}` : "Tệp"} chứa mã độc (${result.signature}), hệ thống không nhận. Quét virus máy của bạn rồi chọn tệp khác.`);
}
