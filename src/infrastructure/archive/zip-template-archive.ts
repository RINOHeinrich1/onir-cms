import { unzipSync } from "fflate";
import { ValidationError } from "@/application/errors";
import type { TemplateArchiveReader } from "@/application/ports/template-archive";
import { isSafeRelativePath } from "@/domain/entities/visual-template";

const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Adapter ZIP du port `TemplateArchiveReader` (fflate). Rejette toute archive
 * non conforme : chemins non sûrs, trop de fichiers, tailles excessives
 * (anti-zip-bomb), contenu illisible.
 */
export function zipTemplateArchive(): TemplateArchiveReader {
  return {
    async extract(data: Buffer): Promise<Map<string, Buffer>> {
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(new Uint8Array(data));
      } catch {
        throw new ValidationError("Archive invalide (ZIP illisible)");
      }

      const files = new Map<string, Buffer>();
      let total = 0;
      for (const [rawPath, content] of Object.entries(entries)) {
        // Ignore les entrées de dossier.
        if (rawPath.endsWith("/")) continue;
        if (!isSafeRelativePath(rawPath)) {
          throw new ValidationError(`Chemin d'archive interdit : ${rawPath}`);
        }
        if (content.byteLength > MAX_FILE_BYTES) {
          throw new ValidationError(`Fichier trop volumineux dans l'archive : ${rawPath}`);
        }
        total += content.byteLength;
        if (total > MAX_TOTAL_BYTES) {
          throw new ValidationError("Archive trop volumineuse (taille décompressée dépassée)");
        }
        if (files.size >= MAX_FILES) {
          throw new ValidationError("Trop de fichiers dans l'archive");
        }
        files.set(rawPath, Buffer.from(content));
      }
      return files;
    },
  };
}
