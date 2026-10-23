/**
 * Chiffrement réversible des jetons de liens partageables (AES-256-GCM).
 * Le hash SHA-256 reste la clé de recherche ; le chiffré permet de
 * ré-afficher une URL stable sans rotation. Clé : `LINK_TOKEN_KEY`
 * (32 octets hex), jamais commise, jamais exposée au client.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { linkTokenKey } from "@/lib/env";

const PREFIX = "v1";

/** Chiffre un jeton en clair → `v1:iv:donnees:tag` (hex). */
export function encryptLinkToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", linkTokenKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("hex")}:${data.toString("hex")}:${tag.toString("hex")}`;
}

/** Déchiffre un jeton ; lève une erreur en cas d'altération ou de mauvaise clé. */
export function decryptLinkToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Jeton chiffré illisible");
  }
  const [, ivHex, dataHex, tagHex] = parts;
  if (ivHex === undefined || dataHex === undefined || tagHex === undefined) {
    throw new Error("Jeton chiffré illisible");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", linkTokenKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const data = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return data.toString("utf8");
  } catch {
    throw new Error("Jeton chiffré illisible");
  }
}
