/**
 * Chiffrement des secrets de webhooks (ADR-0035).
 * AES-256-GCM avec une clé dédiée `WEBHOOK_SECRET_KEY`, indépendante de
 * `SESSION_SECRET`. Le format scellé est versionné et base64url :
 * `v1:<iv>:<tag>:<ciphertext>`.
 */
import { webhookSecretKey } from "@/infrastructure/config/app-secrets";
import { openWebhookSecretWithKey, sealWebhookSecretWithKey } from "@/lib/secret-codecs";

/** Scelle une chaîne qui pourra être lue uniquement avec la clé webhook. */
export function sealWebhookSecret(plain: string): string {
  return sealWebhookSecretWithKey(plain, webhookSecretKey());
}

/** Ouvre une valeur scellée par `sealWebhookSecret`. */
export function openWebhookSecret(sealed: string): string {
  return openWebhookSecretWithKey(sealed, webhookSecretKey());
}

/** Vrai si la valeur a le format d'un secret scellé. */
export function isSealedWebhookSecret(value: string): boolean {
  return value.startsWith("v1:");
}

/** Scelle une valeur JSON. */
export function sealWebhookJson(value: unknown): string {
  return sealWebhookSecret(JSON.stringify(value));
}

/** Ouvre une valeur JSON scellée. */
export function openWebhookJson<T>(sealed: string): T {
  return JSON.parse(openWebhookSecret(sealed)) as T;
}
