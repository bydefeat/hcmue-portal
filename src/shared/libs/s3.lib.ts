import "server-only";
import { createHash, createHmac } from "node:crypto";

// Client S3 tối thiểu (AWS S3, Cloudflare R2, MinIO) cho kho tệp: PutObject, GetObject, DeleteObject, ListObjectsV2, ký
// AWS Signature V4 bằng node:crypto. Không dùng @aws-sdk/client-s3 vì chỉ cần 4 lệnh này, còn SDK kéo theo vài chục gói.

export type S3Config = {
  // Bỏ trống thì dùng AWS: https://s3.<region>.amazonaws.com. R2: https://<account>.r2.cloudflarestorage.com, MinIO: http://host:9000.
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  // MinIO và nhiều S3 tự dựng chỉ nhận /<bucket>/<key>; AWS và R2 nhận được cả <bucket>.<host>/<key>.
  forcePathStyle: boolean;
};

export const EMPTY_PAYLOAD_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const REQUEST_TIMEOUT_MS = 30_000;

export class S3Error extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    operation: string,
  ) {
    super(`S3 ${operation}: ${status} ${code}`);
  }
}

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

// Mã hóa URI theo SigV4: giữ A-Z a-z 0-9 - _ . ~, còn lại %XX viết hoa; khóa đối tượng giữ dấu gạch chéo.
export function uriEncode(value: string, keepSlash = false) {
  const encoded = encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return keepSlash ? encoded.replace(/%2F/g, "/") : encoded;
}

// Xếp theo tên rồi theo giá trị (đã mã hóa), không xếp cả chuỗi "tên=giá trị": "a-b" phải đứng sau "a".
function sortedQuery(pairs: [string, string][]) {
  return pairs
    .toSorted(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export type SignInput = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
};

// Ký request theo AWS Signature Version 4 (header Authorization). Query của `url` phải đã mã hóa bằng uriEncode và xếp
// theo tên để chuỗi gửi đi trùng chuỗi đã ký. Trả về các header cần gửi kèm (đã gồm x-amz-date, x-amz-content-sha256).
export function signRequest(input: SignInput): Record<string, string> {
  const timestamp = amzDate(input.date);
  const day = timestamp.slice(0, 8);
  const headers: Record<string, string> = { ...input.headers, host: input.url.host, "x-amz-date": timestamp, "x-amz-content-sha256": input.payloadHash };
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .toSorted();
  const valueOf = (name: string) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)![1];
  const canonicalHeaders = names.map((name) => `${name}:${valueOf(name).trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalQuery = sortedQuery(
    input.url.search
      .slice(1)
      .split("&")
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return (at < 0 ? [pair, ""] : [pair.slice(0, at), pair.slice(at + 1)]) as [string, string];
      }),
  );
  const canonicalRequest = [input.method, input.url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", timestamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}` };
}

// Địa chỉ đối tượng (key) hoặc bucket (key null) theo kiểu path-style hoặc virtual-hosted.
export function s3Url(config: S3Config, key: string | null, query: [string, string][] = []) {
  const base = new URL(config.endpoint ?? `https://s3.${config.region}.amazonaws.com`);
  const prefix = base.pathname.replace(/\/+$/, "");
  const url = new URL(base.origin);
  if (!config.forcePathStyle) url.host = `${config.bucket}.${base.host}`;
  const bucketPath = config.forcePathStyle ? `/${uriEncode(config.bucket)}` : "";
  url.pathname = key === null ? `${prefix}${bucketPath}${config.forcePathStyle ? "" : "/"}` : `${prefix}${bucketPath}/${uriEncode(key, true)}`;
  url.search = sortedQuery(query.map(([name, value]) => [uriEncode(name), uriEncode(value)]));
  return url;
}

type SendOptions = { query?: [string, string][]; body?: Uint8Array; headers?: Record<string, string>; signal?: AbortSignal };

async function send(config: S3Config, method: string, key: string | null, options: SendOptions = {}) {
  const url = s3Url(config, key, options.query);
  const headers = signRequest({
    method,
    url,
    headers: options.headers ?? {},
    payloadHash: options.body ? sha256Hex(options.body) : EMPTY_PAYLOAD_SHA256,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: new Date(),
  });
  return fetch(url, { method, headers, body: options.body as Uint8Array<ArrayBuffer> | undefined, signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "error" });
}

function xmlText(value: string) {
  return value.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => {
    const named: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  });
}

function xmlTag(xml: string, tag: string) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? xmlText(match[1]) : null;
}

// Lỗi S3 trả XML <Error><Code>...</Code></Error>; chỉ giữ mã lỗi, không đưa URL hay header (có chữ ký) vào thông báo.
async function failed(response: Response, operation: string): Promise<never> {
  const body = await response.text().catch(() => "");
  throw new S3Error(response.status, xmlTag(body, "Code") ?? response.statusText, operation);
}

export async function s3PutObject(config: S3Config, key: string, data: Uint8Array, contentType = "application/octet-stream") {
  const response = await send(config, "PUT", key, { body: data, headers: { "content-type": contentType } });
  if (!response.ok) await failed(response, `PUT ${key}`);
  await response.body?.cancel();
}

// Trả luồng nội dung để route tải xuống chuyển thẳng cho trình duyệt, không đệm cả tệp trong bộ nhớ. Hết giờ chỉ tính tới lúc
// nhận header: người tải mạng chậm làm luồng đọc chậm, không được cắt giữa chừng.
export async function s3GetObject(config: S3Config, key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("S3 GET quá thời gian chờ")), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await send(config, "GET", key, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok || !response.body) return failed(response, `GET ${key}`);
  return { body: response.body, size: Number(response.headers.get("content-length") ?? 0) };
}

// S3 trả 204 cả khi khóa không tồn tại; một số bản tự dựng trả 404, coi như đã xóa.
export async function s3DeleteObject(config: S3Config, key: string) {
  const response = await send(config, "DELETE", key);
  if (!response.ok && response.status !== 404) await failed(response, `DELETE ${key}`);
  await response.body?.cancel();
}

export type S3Object = { key: string; lastModified: Date };

// ListObjectsV2 theo tiền tố, đi hết các trang bằng continuation-token (mỗi trang tối đa 1000 khóa, máy chủ có thể trả ít hơn).
export async function s3ListObjects(config: S3Config, prefix: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let token: string | null = null;
  do {
    const query: [string, string][] = [
      ["list-type", "2"],
      ["prefix", prefix],
    ];
    if (token) query.push(["continuation-token", token]);
    const response = await send(config, "GET", null, { query });
    if (!response.ok) await failed(response, `LIST ${prefix}`);
    const xml = await response.text();
    for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = xmlTag(block, "Key");
      const modified = xmlTag(block, "LastModified");
      if (key !== null && modified !== null) objects.push({ key, lastModified: new Date(modified) });
    }
    token = xmlTag(xml, "IsTruncated") === "true" ? xmlTag(xml, "NextContinuationToken") : null;
  } while (token);
  return objects;
}
