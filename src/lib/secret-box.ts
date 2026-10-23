/**
 * Chiffrement des secrets d'infrastructure stockés en base (AES-256-GCM).
 * Clé dérivée de `SESSION_SECRET` (scrypt, sel fixe versionné) : changer
 * `SESSION_SECRET` rend les secrets illisibles et impose une rotation.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { sessionSecret } from "@/lib/env";

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

const SALT = "onirtech:secret-box:v1";
let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (cachedKey === undefined) {
    cachedKey = scryptSync(sessionSecret(), SALT, 32);
  }
  return cachedKey;
}

export function sealSecret(plain: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
