import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";
import { memoryStore } from "./memoryStore";

type S3Config = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cachedS3Client: S3Client | null = null;
let cachedS3Key = "";

function getS3Config(): S3Config | null {
  const bucket = ENV.s3Bucket.trim();
  const accessKeyId = ENV.s3AccessKeyId.trim();
  const secretAccessKey = ENV.s3SecretAccessKey.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: ENV.s3Region.trim() || "auto",
    endpoint: ENV.s3Endpoint.trim() || undefined,
    accessKeyId,
    secretAccessKey,
  };
}

function getS3Client(cfg: S3Config): S3Client {
  const cacheKey = `${cfg.bucket}|${cfg.region}|${cfg.endpoint ?? ""}|${cfg.accessKeyId}`;
  if (!cachedS3Client || cachedS3Key !== cacheKey) {
    cachedS3Client = new S3Client({
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
    cachedS3Key = cacheKey;
  }
  return cachedS3Client;
}

function getStorageRootDir(): string {
  const configured = ENV.storageDir.trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), ".data/storage");
}

function normalizeKey(relKey: string): string {
  const normalized = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some(part => part === ".." || part === ".")) {
    throw new Error("Saxlama açarı etibarsızdır.");
  }
  return normalized;
}

function resolveDiskPath(key: string): string {
  const root = getStorageRootDir();
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Saxlama yolu icazə verilən qovluqdan kənardadır.");
  }
  return target;
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  const s3Config = getS3Config();

  if (s3Config) {
    const client = getS3Client(s3Config);
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return { key, url: `/api/storage/${key}` };
  }

  memoryStore.storageBlobs.set(key, { bytes, contentType });
  try {
    const diskPath = resolveDiskPath(key);
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, bytes);
  } catch (error) {
    console.warn("[Storage] Disk yazılması alınmadı, yaddaşda saxlanılır:", error);
  }

  return { key, url: `/api/storage/${key}` };
}

export async function storageGetObject(
  relKey: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const key = normalizeKey(relKey);
  const s3Config = getS3Config();

  if (s3Config) {
    try {
      const client = getS3Client(s3Config);
      const result = await client.send(
        new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: key,
        }),
      );
      if (!result.Body) return null;
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      return {
        bytes,
        contentType: result.ContentType || (key.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
      };
    } catch (error) {
      if ((error as { name?: string })?.name === "NoSuchKey") return null;
      throw error;
    }
  }

  const inMemory = memoryStore.storageBlobs.get(key);
  if (inMemory) return inMemory;

  try {
    const diskPath = resolveDiskPath(key);
    const bytes = await fs.readFile(diskPath);
    const contentType = key.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
    memoryStore.storageBlobs.set(key, { bytes, contentType });
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/api/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/api/storage/${key}`;
}
