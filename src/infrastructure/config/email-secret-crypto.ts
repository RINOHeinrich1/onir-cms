import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { configMasterKey } from "@/infrastructure/config/app-secret-crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function master(): Buffer {
  const key = configMasterKey();
  if (key === null)
    throw new Error("CONFIG_MASTER_KEY absente : impossible de chiffrer le secret SMTP");
  return key;
}

function aad(scope: string): Buffer {
  return Buffer.from(`onir:email:${scope}:v1`, "utf8");
}

export function sealEmailSecret(scope: string, value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", master(), iv);
  cipher.setAAD(aad(scope));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function openEmailSecret(scope: string, sealed: string): string {
  if (sealed === "") return "";
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = sealed.split(":");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error("Secret SMTP illisible");
  }
  const decipher = createDecipheriv("aes-256-gcm", master(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
