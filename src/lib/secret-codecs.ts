/**
 * Codecs cryptographiques à clé explicite (ADR-0036).
 * Ils sont utilisés à la fois par le runtime (clé courante) et par les
 * rotations (ancienne/nouvelle clé) sans dépendre du cache de configuration.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { apiKeyHint } from "@/domain/entities/ai-provider";

const IV_BYTES = 12;

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export type SealedAiKey = SealedSecret;

export type SealedAiKeyWithHint = SealedAiKey & { hint: string };

/* -------------------------------------------------------------------------- */
/* Liens / invitations                                                        */
/* -------------------------------------------------------------------------- */

const LINK_PREFIX = "v1";

export function sealLinkTokenWithKey(token: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    LINK_PREFIX,
    iv.toString("hex"),
    data.toString("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}

export function openLinkTokenWithKey(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== LINK_PREFIX) {
    throw new Error("Jeton chiffré illisible");
  }
  const [, ivHex, dataHex, tagHex] = parts;
  if (ivHex === undefined || dataHex === undefined || tagHex === undefined) {
    throw new Error("Jeton chiffré illisible");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new Error("Jeton chiffré illisible");
  }
}

/* -------------------------------------------------------------------------- */
/* Fournisseurs IA                                                            */
/* -------------------------------------------------------------------------- */

const AI_AAD = Buffer.from("onirtech:ai-provider:v1", "utf8");

export function sealAiKeyWithKey(plain: string, key: Buffer): SealedAiKeyWithHint {
  const value = plain.trim();
  if (value === "") throw new Error("Clé API vide");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AI_AAD);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    hint: apiKeyHint(value),
  };
}

export function openAiKeyWithKey(sealed: SealedAiKey, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(AI_AAD);
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                   */
/* -------------------------------------------------------------------------- */

const WEBHOOK_VERSION = "v1";

export function sealWebhookSecretWithKey(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    WEBHOOK_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function openWebhookSecretWithKey(sealed: string, key: Buffer): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = sealed.split(":");
  if (
    version !== WEBHOOK_VERSION ||
    ivEncoded === undefined ||
    tagEncoded === undefined ||
    ciphertextEncoded === undefined
  ) {
    throw new Error("Secret webhook invalide");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/* -------------------------------------------------------------------------- */
/* Secret-box (SESSION_SECRET, scrypt)                                        */
/* -------------------------------------------------------------------------- */

const SECRET_BOX_SALT = "onirtech:secret-box:v1";

function secretBoxKey(secret: string): Buffer {
  return scryptSync(secret, SECRET_BOX_SALT, 32);
}

export function sealSecretBoxWithSecret(plain: string, secret: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", secretBoxKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openSecretBoxWithSecret(sealed: SealedSecret, secret: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretBoxKey(secret),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
