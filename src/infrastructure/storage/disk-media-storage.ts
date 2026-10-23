import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaStorage, StoredFile } from "@/application/ports/media-storage";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/**
 * Clés valides uniquement — anti-traversée de répertoire :
 * - legacy : `UUID.ext` (fichiers existants, ADR-0025 §10) ;
 * - nouveau : `orgs/<orgId>/UUID.ext`.
 */
const LEGACY_KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]+$/;
const ORG_KEY_PATTERN = /^orgs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/;

/** Adapter disque du port `MediaStorage` : fichiers hors base et hors `public/`. */
export function diskMediaStorage(baseDir: string): MediaStorage {
  const resolve = (key: string): string | null => {
    if (LEGACY_KEY_PATTERN.test(key) || ORG_KEY_PATTERN.test(key)) {
      return path.join(baseDir, key);
    }
    return null;
  };

  return {
    async save({ data, contentType, organizationId }): Promise<string> {
      const extension = EXTENSION_BY_MIME[contentType] ?? "bin";
      const uuid = randomUUID();
      if (organizationId === undefined) {
        // Assets du catalogue plateforme (templates visuels) : format global.
        await mkdir(baseDir, { recursive: true });
        const key = `${uuid}.${extension}`;
        await writeFile(path.join(baseDir, key), data);
        return key;
      }
      if (!/^[0-9a-f-]{36}$/.test(organizationId)) {
        throw new Error("Identifiant d'organisation invalide pour le stockage");
      }
      const directory = path.join(baseDir, "orgs", organizationId);
      await mkdir(directory, { recursive: true });
      const key = `orgs/${organizationId}/${uuid}.${extension}`;
      await writeFile(path.join(baseDir, key), data);
      return key;
    },

    async read(key): Promise<StoredFile | null> {
      const target = resolve(key);
      if (target === null) return null;
      try {
        const data = await readFile(target);
        return {
          data,
          contentType: MIME_BY_EXTENSION[path.extname(key)] ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },

    async remove(key): Promise<void> {
      const target = resolve(key);
      if (target === null) return;
      await rm(target, { force: true });
    },
  };
}
