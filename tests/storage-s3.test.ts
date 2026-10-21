import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type * as S3Lib from "@/shared/libs/s3.lib";
import type * as StorageLib from "@/shared/libs/storage.lib";
import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";



type FakeS3 = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  objects: Map<string, { data: Buffer; lastModified: Date }>;
  requests: { method: string; path: string; query: string; status: number }[];
  close: () => Promise<void>;
};

const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function errorXml(code: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`;
}

function verifySignature(request: IncomingMessage, rawPath: string, rawQuery: string, body: Buffer, secret: string, accessKeyId: string, region: string) {
  const header = request.headers.authorization ?? "";
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request,SignedHeaders=([a-z0-9;-]+),Signature=([0-9a-f]{64})$/.exec(header);
  if (!match) return "AuthorizationHeaderMalformed";
  const [, keyId, day, signedRegion, signedHeaders, signature] = match;
  if (keyId !== accessKeyId) return "InvalidAccessKeyId";
  if (signedRegion !== region) return "AuthorizationHeaderMalformed";
  const amzDate = String(request.headers["x-amz-date"] ?? "");
  if (!amzDate.startsWith(day)) return "AuthorizationHeaderMalformed";
  const payloadHash = String(request.headers["x-amz-content-sha256"] ?? "");
  if (payloadHash !== sha256(body)) return "XAmzContentSHA256Mismatch";
  const names = signedHeaders.split(";");
  if (!names.includes("host") || !names.includes("x-amz-date") || !names.includes("x-amz-content-sha256")) return "AccessDenied";
  const canonicalHeaders = names.map((name) => `${name}:${String(request.headers[name] ?? "").trim().replace(/\s+/g, " ")}\n`).join("");
  const canonicalPath = rawPath
    .split("/")
    .map((segment) => rfc3986(decodeURIComponent(segment)))
    .join("/");
  const canonicalQuery = rawQuery
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [name, value = ""] = pair.split("=");
      return [rfc3986(decodeURIComponent(name)), rfc3986(decodeURIComponent(value))];
    })
    .toSorted(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const canonicalRequest = [request.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, `${day}/${region}/s3/aws4_request`, sha256(canonicalRequest)].join("\n");
  let key: Buffer = createHmac("sha256", `AWS4${secret}`).update(day).digest();
  for (const part of [region, "s3", "aws4_request"]) key = createHmac("sha256", key).update(part).digest();
  const expected = createHmac("sha256", key).update(stringToSign).digest("hex");
  return expected === signature ? null : "SignatureDoesNotMatch";
}

async function startFakeS3({ pageSize = 2 } = {}): Promise<FakeS3> {
  const bucket = "hcmue-test";
  const region = "auto";
  const accessKeyId = "AKIDFAKES3TEST";
  const secretAccessKey = "fake/secret+key=1234567890";
  const objects: FakeS3["objects"] = new Map();
  const requests: FakeS3["requests"] = [];
  const tokens = new Map<string, string>();

  const handle = (request: IncomingMessage, response: ServerResponse, body: Buffer) => {
    const raw = request.url ?? "/";
    const at = raw.indexOf("?");
    const rawPath = at < 0 ? raw : raw.slice(0, at);
    const rawQuery = at < 0 ? "" : raw.slice(at + 1);
    const reply = (status: number, payload: string | Buffer = "", headers: Record<string, string> = {}) => {
      requests.push({ method: request.method ?? "", path: rawPath, query: rawQuery, status });
      response.writeHead(status, headers);
      response.end(payload);
    };
    const problem = verifySignature(request, rawPath, rawQuery, body, secretAccessKey, accessKeyId, region);
    if (problem) return reply(403, errorXml(problem), { "content-type": "application/xml" });
    const [, bucketName, ...rest] = rawPath.split("/");
    if (decodeURIComponent(bucketName) !== bucket) return reply(404, errorXml("NoSuchBucket"), { "content-type": "application/xml" });
    const key = rest.map(decodeURIComponent).join("/");
    const params = new URLSearchParams(rawQuery);

    if (request.method === "GET" && key === "" && params.get("list-type") === "2") {
      const prefix = params.get("prefix") ?? "";
      const keys = [...objects.keys()].filter((name) => name.startsWith(prefix)).toSorted();
      const given = params.get("continuation-token");
      if (given !== null && !tokens.has(given)) return reply(400, errorXml("InvalidArgument"), { "content-type": "application/xml" });
      const lastKey = given === null ? null : tokens.get(given)!;
      const remaining = lastKey === null ? keys : keys.filter((name) => name > lastKey);
      const page = remaining.slice(0, pageSize);
      const truncated = remaining.length > page.length;
      const token = `tok+${tokens.size}/x==`;
      if (truncated) tokens.set(token, page.at(-1)!);
      const contents = page
        .map((name) => `<Contents><Key>${xmlEscape(name)}</Key><LastModified>${objects.get(name)!.lastModified.toISOString()}</LastModified><Size>${objects.get(name)!.data.byteLength}</Size></Contents>`)
        .join("");
      return reply(
        200,
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${token}</NextContinuationToken>` : ""}${contents}</ListBucketResult>`,
        { "content-type": "application/xml" },
      );
    }
    if (key === "") return reply(400, errorXml("InvalidRequest"), { "content-type": "application/xml" });
    if (request.method === "PUT") {
      objects.set(key, { data: body, lastModified: new Date() });
      return reply(200, "", { etag: `"${sha256(body).slice(0, 32)}"` });
    }
    if (request.method === "GET") {
      const object = objects.get(key);
      if (!object) return reply(404, errorXml("NoSuchKey"), { "content-type": "application/xml" });
      return reply(200, object.data, { "content-type": "application/octet-stream", "content-length": String(object.data.byteLength) });
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return reply(204);
    }
    return reply(405, errorXml("MethodNotAllowed"), { "content-type": "application/xml" });
  };

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => handle(request, response, Buffer.concat(chunks)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    objects,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}


let s3: FakeS3;
let storage: typeof StorageLib;
let s3lib: typeof S3Lib;

before(async () => {
  s3 = await startFakeS3({ pageSize: 2 });
  Object.assign(process.env, {
    DEFEAT_STORAGE_DRIVER: "s3",
    DEFEAT_S3_ENDPOINT: s3.endpoint,
    DEFEAT_S3_REGION: s3.region,
    DEFEAT_S3_BUCKET: s3.bucket,
    DEFEAT_S3_ACCESS_KEY_ID: s3.accessKeyId,
    DEFEAT_S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    DEFEAT_S3_FORCE_PATH_STYLE: "true",
    DEFEAT_CLAMAV_HOST: "",
  });
  storage = await import("@/shared/libs/storage.lib");
  s3lib = await import("@/shared/libs/s3.lib");
});

after(() => s3.close());

const signatureOf = (headers: Record<string, string>) => /Signature=([0-9a-f]+)$/.exec(headers.authorization)![1];

const AWS_EXAMPLE = { region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", date: new Date("2013-05-24T00:00:00Z") };

describe("s3: chữ ký SigV4", () => {
  test("khớp chữ ký mẫu của AWS: GetObject có Range, ListObjects, PutObject có ký tự $", () => {
    const get = s3lib.signRequest({ ...AWS_EXAMPLE, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"), headers: { range: "bytes=0-9" }, payloadHash: s3lib.EMPTY_PAYLOAD_SHA256 });
    assert.equal(signatureOf(get), "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    assert.match(get.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
    const list = s3lib.signRequest({ ...AWS_EXAMPLE, method: "GET", url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"), headers: {}, payloadHash: s3lib.EMPTY_PAYLOAD_SHA256 });
    assert.equal(signatureOf(list), "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7");
    const put = s3lib.signRequest({
      ...AWS_EXAMPLE,
      method: "PUT",
      url: new URL(`https://examplebucket.s3.amazonaws.com/${s3lib.uriEncode("test$file.text", true)}`),
      headers: { date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-storage-class": "REDUCED_REDUNDANCY" },
      payloadHash: "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
    });
    assert.equal(signatureOf(put), "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
    assert.equal(put["x-amz-date"], "20130524T000000Z");
  });

  test("địa chỉ: AWS mặc định virtual-hosted, R2/MinIO theo endpoint, path-style khi bật", () => {
    const config = { region: "ap-southeast-1", bucket: "hcmue-files", accessKeyId: "a", secretAccessKey: "b", forcePathStyle: false };
    assert.equal(s3lib.s3Url(config, "exams/x").href, "https://hcmue-files.s3.ap-southeast-1.amazonaws.com/exams/x");
    assert.equal(s3lib.s3Url({ ...config, endpoint: "https://acc.r2.cloudflarestorage.com" }, null, [["prefix", "exams/"], ["list-type", "2"]]).href, "https://hcmue-files.acc.r2.cloudflarestorage.com/?list-type=2&prefix=exams%2F");
    assert.equal(s3lib.s3Url({ ...config, endpoint: "http://minio:9000", forcePathStyle: true }, "requests/a b").href, "http://minio:9000/hcmue-files/requests/a%20b");
    assert.equal(s3lib.uriEncode("a-b_c.d~e f+g/h*"), "a-b_c.d~e%20f%2Bg%2Fh%2A");
  });
});

describe("storage: driver s3", () => {
  test("ghi, đọc (luồng), xóa qua S3; khóa xấu bị chặn trước khi gọi S3", async () => {
    const key = storage.newStorageKey("exams");
    const data = new TextEncoder().encode("%PDF-1.7 đề thi thật");
    await storage.putFile(key, data);
    assert.deepEqual(new Uint8Array(s3.objects.get(key)!.data), data);
    assert.deepEqual(await storage.readFile(key), data);

    const opened = await storage.openFile(key);
    assert.ok(opened && opened.body instanceof ReadableStream);
    assert.equal(opened.size, data.byteLength);
    const response = storage.fileResponse(opened, { fileName: "Đề thi.pdf", contentType: "application/pdf" });
    assert.equal(response.headers.get("content-length"), String(data.byteLength));
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.ok(![...response.headers.values()].some((value) => value.includes(s3.endpoint) || value.includes(s3.bucket)), "không lộ địa chỉ bucket");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data);

    await storage.deleteFile(key);
    assert.equal(s3.objects.has(key), false);
    assert.equal(await storage.readFile(key), null);
    assert.equal(await storage.openFile(key), null);

    const sent = s3.requests.length;
    await assert.rejects(storage.putFile("../x", data), storage.StorageKeyError);
    await assert.rejects(storage.readFile("exams/../../etc/passwd"), storage.StorageKeyError);
    assert.equal(s3.requests.length, sent);
  });

  test("withStoredFiles: giao dịch hỏng thì đối tượng vừa ghi bị xóa khỏi bucket", async () => {
    const files = [1, 2, 3].map((value) => ({ key: storage.newStorageKey("requests"), data: new Uint8Array([value]) }));
    await assert.rejects(
      storage.withStoredFiles(files, async () => {
        assert.equal(files.filter((file) => s3.objects.has(file.key)).length, 3);
        throw new Error("giao dịch hỏng");
      }),
      /giao dịch hỏng/,
    );
    assert.equal(files.filter((file) => s3.objects.has(file.key)).length, 0);
  });

  test("listFiles đi hết các trang ListObjectsV2, chỉ lấy khóa đúng mẫu trong thư mục; dọn mồ côi theo LastModified", async () => {
    s3.objects.clear();
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const keys = Array.from({ length: 5 }, () => storage.newStorageKey("exams"));
    for (const key of keys) await storage.putFile(key, new Uint8Array([1]));
    await storage.putFile(storage.newStorageKey("requests"), new Uint8Array([2]));
    s3.objects.set("exams/khong-phai-khoa.txt", { data: Buffer.from("x"), lastModified: old });
    for (const key of keys.slice(0, 4)) s3.objects.get(key)!.lastModified = old;

    const listed = s3.requests.length;
    const entries = await storage.listFiles("exams");
    assert.deepEqual(entries.map((entry) => entry.key).toSorted(), keys.toSorted());
    const pages = s3.requests.slice(listed).filter((request) => request.query.includes("list-type=2"));
    assert.equal(pages.length, 3);
    assert.ok(pages.every((request) => request.status === 200));
    assert.match(pages[1].query, /continuation-token=tok%2B\d+%2Fx%3D%3D/);

    const referenced = keys[0];
    const removed = await storage.sweepOrphanFiles("exams", async (candidates) => new Set(candidates.filter((key) => key === referenced)));
    assert.equal(removed, 3);
    assert.ok(s3.objects.has(referenced));
    assert.ok(s3.objects.has(keys[4]), "tệp mới (trong thời gian chờ) không bị xóa");
    assert.ok(s3.objects.has("exams/khong-phai-khoa.txt"), "đối tượng lạ không bị đụng tới");
    for (const key of keys.slice(1, 4)) assert.equal(s3.objects.has(key), false);
  });

  test("sai khóa bí mật: S3 từ chối 403, lỗi chỉ nêu mã lỗi, không lộ khóa", async () => {
    const config = { endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket, accessKeyId: s3.accessKeyId, secretAccessKey: "sai-khoa-bi-mat", forcePathStyle: true };
    const error = await s3lib.s3PutObject(config, "exams/x", new Uint8Array([1])).catch((caught: unknown) => caught);
    assert.ok(error instanceof s3lib.S3Error);
    assert.equal(error.status, 403);
    assert.equal(error.code, "SignatureDoesNotMatch");
    assert.ok(!error.message.includes("sai-khoa-bi-mat"));
    const good = { ...config, secretAccessKey: s3.secretAccessKey };
    await s3lib.s3PutObject(good, "thư mục/a b+c$(1).pdf", new Uint8Array([5]));
    assert.deepEqual([...s3.objects.get("thư mục/a b+c$(1).pdf")!.data], [5]);
    const listed = await s3lib.s3ListObjects(good, "thư mục/");
    assert.deepEqual(
      listed.map((object) => object.key),
      ["thư mục/a b+c$(1).pdf"],
    );
    await s3lib.s3DeleteObject(good, "thư mục/a b+c$(1).pdf");
    assert.equal(s3.objects.has("thư mục/a b+c$(1).pdf"), false);
  });
});
