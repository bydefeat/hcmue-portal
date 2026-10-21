import "server-only";
import { mkdir, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@/shared/libs/env.lib";
import { newId } from "@/shared/libs/id.lib";
import { s3DeleteObject, s3GetObject, s3ListObjects, s3PutObject, type S3Config } from "@/shared/libs/s3.lib";
import { contentDisposition } from "@/shared/libs/upload.lib";
import { assertCleanUpload } from "@/shared/libs/virus-scan.lib";


export type StorageNamespace = "requests" | "exams" | "reports";

const NAMESPACES: readonly StorageNamespace[] = ["requests", "exams", "reports"];

const KEY = /^(requests|exams|reports)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

function checkedKey(key: string) {
  if (!isStorageKey(key)) throw new StorageKeyError(key);
  return key;
}

export type OpenedFile = { body: ReadableStream<Uint8Array>; size: number };

export type StoredEntry = { key: string; modifiedAt: Date };

type StorageDriver = {
  put(key: string, data: Uint8Array): Promise<void>;
  open(key: string): Promise<OpenedFile | null>;
  remove(key: string): Promise<void>;
  list(namespace: StorageNamespace): Promise<StoredEntry[]>;
};

function root() {
  return path.resolve(env.DEFEAT_STORAGE_DIRECTORY);
}

function pathOf(key: string) {
  const base = root();
  const target = path.resolve(base, checkedKey(key));
  if (!target.startsWith(base + path.sep)) throw new StorageKeyError(key);
  return target;
}

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

const localDriver: StorageDriver = {
  async put(key, data) {
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
  },
  async open(key) {
    let handle;
    try {
      handle = await open(pathOf(key), "r");
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    try {
      const { size } = await handle.stat();
      return { body: Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>, size };
    } catch (error) {
      await handle.close();
      throw error;
    }
  },
  async remove(key) {
    await rm(pathOf(key), { force: true });
  },
  async list(namespace) {
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
  },
};

function s3Driver(config: S3Config): StorageDriver {
  return {
    put: (key, data) => s3PutObject(config, key, data),
    open: (key) => s3GetObject(config, key),
    remove: (key) => s3DeleteObject(config, key),
    async list(namespace) {
      const objects = await s3ListObjects(config, `${namespace}/`);
      return objects.filter((object) => isStorageKey(object.key)).map((object) => ({ key: object.key, modifiedAt: object.lastModified }));
    },
  };
}

let selected: StorageDriver | null = null;

function driver() {
  selected ??=
    env.DEFEAT_STORAGE_DRIVER === "s3"
      ? s3Driver({
          endpoint: env.DEFEAT_S3_ENDPOINT,
          region: env.DEFEAT_S3_REGION!,
          bucket: env.DEFEAT_S3_BUCKET!,
          accessKeyId: env.DEFEAT_S3_ACCESS_KEY_ID!,
          secretAccessKey: env.DEFEAT_S3_SECRET_ACCESS_KEY!,
          forcePathStyle: env.DEFEAT_S3_FORCE_PATH_STYLE,
        })
      : localDriver;
  return selected;
}

export async function putFile(key: string, data: Uint8Array) {
  await driver().put(checkedKey(key), data);
}

export async function openFile(key: string): Promise<OpenedFile | null> {
  return driver().open(checkedKey(key));
}

export async function readFile(key: string): Promise<Uint8Array | null> {
  const opened = await openFile(key);
  return opened ? new Uint8Array(await new Response(opened.body).arrayBuffer()) : null;
}

export async function deleteFile(key: string) {
  await driver().remove(checkedKey(key));
}

const DELETE_CONCURRENCY = 8;

export async function deleteFiles(keys: string[]) {
  const queue = [...keys];
  const worker = async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      try {
        await deleteFile(key);
      } catch (error) {
        console.error("[storage] Không xóa được tệp:", error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DELETE_CONCURRENCY, queue.length) }, worker));
}

export type StoredFile = { key: string; data: Uint8Array; name?: string };

export async function withStoredFiles<T>(files: StoredFile[], work: () => Promise<T>): Promise<T> {
  for (const file of files) await assertCleanUpload(file);
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

export async function listFiles(namespace: StorageNamespace): Promise<StoredEntry[]> {
  if (!NAMESPACES.includes(namespace)) throw new StorageKeyError(namespace);
  return driver().list(namespace);
}

export async function sweepOrphanFiles(namespace: StorageNamespace, isReferenced: (keys: string[]) => Promise<Set<string>>, graceMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - graceMs;
  const candidates = (await listFiles(namespace)).filter((entry) => entry.modifiedAt.getTime() < cutoff).map((entry) => entry.key);
  if (candidates.length === 0) return 0;
  const referenced = await isReferenced(candidates);
  const orphans = candidates.filter((key) => !referenced.has(key));
  await deleteFiles(orphans);
  return orphans.length;
}

export function fileResponse(content: Uint8Array | OpenedFile, file: { fileName: string; contentType: string }) {
  const isBytes = content instanceof Uint8Array;
  const size = isBytes ? content.byteLength : content.size;
  return new Response(isBytes ? new Blob([content as Uint8Array<ArrayBuffer>]) : content.body, {
    headers: {
      "Content-Type": file.contentType,
      ...(size > 0 ? { "Content-Length": String(size) } : {}),
      "Content-Disposition": contentDisposition(file.fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function fileErrorResponse(status: 401 | 404, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
