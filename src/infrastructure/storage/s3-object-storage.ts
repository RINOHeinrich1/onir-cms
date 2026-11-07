import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import type { MediaStorage, StoredFile } from "@/application/ports/media-storage";
import { attachmentExtension } from "@/domain/entities/attachment";
import type { S3Config } from "@/lib/env";

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

const MEDIA_EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const LEGACY_KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]+$/;
const ORG_KEY_PATTERN = /^orgs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/;
const ATTACHMENT_KEY_PATTERN = /^orgs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/;

const clients = new Map<string, S3Client>();

function client(config: S3Config): S3Client {
  const key = `${config.endpoint}|${config.region}|${config.accessKeyId}`;
  const existing = clients.get(key);
  if (existing !== undefined) return existing;
  const created = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  clients.set(key, created);
  return created;
}

function objectKey(config: S3Config, key: string): string {
  return config.prefix === "" ? key : `${config.prefix.replace(/^\/+|\/+$/g, "")}/${key}`;
}

async function bodyBytes(body: unknown): Promise<Buffer> {
  if (body === null || body === undefined) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof candidate.transformToByteArray === "function") {
    return Buffer.from(await candidate.transformToByteArray());
  }
  throw new Error("Corps S3 non lisible");
}

function isMissing(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    value.name === "NoSuchKey" ||
    value.name === "NotFound" ||
    value.$metadata?.httpStatusCode === 404
  );
}

export function s3MediaStorage(config: S3Config): MediaStorage {
  const bucket = config.bucket;
  return {
    async save({ data, contentType, organizationId }): Promise<string> {
      const extension = MEDIA_EXTENSION_BY_MIME[contentType] ?? "bin";
      const uuid = randomUUID();
      const key =
        organizationId === undefined
          ? `${uuid}.${extension}`
          : `orgs/${organizationId}/${uuid}.${extension}`;
      await client(config).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(config, key),
          Body: data,
          ContentType: contentType,
        }),
      );
      return key;
    },

    async read(key): Promise<StoredFile | null> {
      if (!LEGACY_KEY_PATTERN.test(key) && !ORG_KEY_PATTERN.test(key)) return null;
      try {
        const response = await client(config).send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(config, key) }),
        );
        return {
          data: await bodyBytes(response.Body),
          contentType:
            response.ContentType ??
            MEDIA_MIME_BY_EXTENSION[key.slice(key.lastIndexOf("."))] ??
            "application/octet-stream",
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async remove(key): Promise<void> {
      if (!LEGACY_KEY_PATTERN.test(key) && !ORG_KEY_PATTERN.test(key)) return;
      try {
        await client(config).send(
          new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(config, key) }),
        );
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },
  };
}

export function s3AttachmentStorage(config: S3Config): AttachmentStorage {
  const bucket = config.bucket;
  return {
    async save({ data, mime, organizationId }): Promise<string> {
      if (!/^[0-9a-f-]{36}$/.test(organizationId)) {
        throw new Error("Identifiant d'organisation invalide pour le stockage");
      }
      const key = `orgs/${organizationId}/${randomUUID()}.${attachmentExtension(mime)}`;
      await client(config).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(config, key),
          Body: data,
          ContentType: mime,
        }),
      );
      return key;
    },

    async read(key): Promise<{ data: Buffer; contentType: string } | null> {
      if (!ATTACHMENT_KEY_PATTERN.test(key)) return null;
      try {
        const response = await client(config).send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(config, key) }),
        );
        return { data: await bodyBytes(response.Body), contentType: "application/octet-stream" };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async remove(key): Promise<void> {
      if (!ATTACHMENT_KEY_PATTERN.test(key)) return;
      try {
        await client(config).send(
          new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(config, key) }),
        );
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },
  };
}
