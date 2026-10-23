/**
 * Chiffrement des clés API fournisseurs (ADR-0029 §6).
 * AES-256-GCM avec une clé DÉDIÉE `AI_PROVIDER_KEY`, distincte de
 * `LINK_TOKEN_KEY` et de `SESSION_SECRET` : une fuite des jetons de liens ne
 * doit pas exposer les clés fournisseurs.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { apiKeyHint } from "@/domain/entities/ai-provider";
import { aiProviderKey } from "@/lib/env";

const AAD = Buffer.from("onirtech:ai-provider:v1", "utf8");

export type SealedAiKey = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export type SealedAiKeyWithHint = SealedAiKey & {
  hint: string;
};

/** Chiffre une clé API. Le clair n'est jamais persisté ni journalisé. */
export function sealAiKey(plain: string): SealedAiKeyWithHint {
  const value = plain.trim();
  if (value === "") throw new Error("Clé API vide");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aiProviderKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    hint: apiKeyHint(value),
  };
}

/** Déchiffre une clé API ; échoue si la clé maîtresse ou le chiffré est altéré. */
export function openAiKey(sealed: SealedAiKey): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    aiProviderKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
