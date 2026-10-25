import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import { attachmentExtension } from "@/domain/entities/attachment";

const KEY_PATTERN = /^orgs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/;

/** Adapter disque privé des pièces jointes (ADR-0034). */
export function diskAttachmentStorage(baseDir: string): AttachmentStorage {
  const resolve = (key: string): string | null =>
    KEY_PATTERN.test(key) ? path.join(baseDir, key) : null;

  return {
    async save({ data, mime, organizationId }): Promise<string> {
      if (!/^[0-9a-f-]{36}$/.test(organizationId)) {
        throw new Error("Identifiant d'organisation invalide pour le stockage");
      }
      const directory = path.join(baseDir, "orgs", organizationId);
      await mkdir(directory, { recursive: true });
      const key = `orgs/${organizationId}/${randomUUID()}.${attachmentExtension(mime)}`;
      await writeFile(path.join(baseDir, key), data, { mode: 0o600 });
      return key;
    },

    async read(key): Promise<{ data: Buffer; contentType: string } | null> {
      const target = resolve(key);
      if (target === null) return null;
      try {
        return {
          data: await readFile(target),
          contentType: "application/octet-stream",
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
