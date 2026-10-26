/**
 * Chiffrement des secrets stockés dans `app_secrets` (ADR-0036).
 * AES-256-GCM avec CONFIG_MASTER_KEY et une AAD liée au nom de la clé.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";
const IV_BYTES = 12;

export type AppSecretKey =
  | "SESSION_SECRET"
  | "LINK_TOKEN_KEY"
  | "AI_PROVIDER_KEY"
  | "WEBHOOK_SECRET_KEY";

export const APP_SECRET_KEYS: readonly AppSecretKey[] = [
  "SESSION_SECRET",
  "LINK_TOKEN_KEY",
  "AI_PROVIDER_KEY",
  "WEBHOOK_SECRET_KEY",
] as const;

export function isAppSecretKey(value: string): value is AppSecretKey {
  return (APP_SECRET_KEYS as readonly string[]).includes(value);
}

/** Clé racine d'amorçage ; `null` si absente. */
export function configMasterKey(): Buffer | null {
  const raw = env("CONFIG_MASTER_KEY");
  if (raw === undefined) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("CONFIG_MASTER_KEY invalide : 64 caractères hexadécimaux attendus");
  }
  return Buffer.from(raw, "hex");
}

function aad(key: AppSecretKey): Buffer {
  return Buffer.from(`onir:app-secret:${key}:v1`, "utf8");
}

export function sealAppSecret(key: AppSecretKey, value: string, master: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", master, iv);
  cipher.setAAD(aad(key));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function openAppSecret(key: AppSecretKey, sealed: string, master: Buffer): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = sealed.split(":");
  if (
    version !== VERSION ||
    ivEncoded === undefined ||
    tagEncoded === undefined ||
    ciphertextEncoded === undefined
  ) {
    throw new Error("Secret applicatif illisible");
  }
  const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(ivEncoded, "base64url"));
  decipher.setAAD(aad(key));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function fingerprintAppSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export function generateAppSecretValue(): string {
  return randomBytes(32).toString("hex");
}

export function validateGeneratedAppSecret(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
