import { createHash } from "node:crypto";
import type { TemplateHasher } from "@/application/ports/template-archive";

/** Adapter SHA-256 (node:crypto) du port `TemplateHasher`. */
export function nodeTemplateHasher(): TemplateHasher {
  return {
    sha256Base64(data: Buffer): string {
      return createHash("sha256").update(data).digest("base64");
    },
    sha256Hex(data: Buffer): string {
      return createHash("sha256").update(data).digest("hex");
    },
  };
}
