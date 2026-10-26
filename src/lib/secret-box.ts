/**
 * Chiffrement des secrets d'infrastructure stockés en base (AES-256-GCM).
 * Clé dérivée de SESSION_SECRET (scrypt, sel fixe versionné). La clé courante
 * est fournie par le cache applicatif (ADR-0036).
 */
import { sessionSecret } from "@/infrastructure/config/app-secrets";
import {
  openSecretBoxWithSecret,
  type SealedSecret,
  sealSecretBoxWithSecret,
} from "@/lib/secret-codecs";

export type { SealedSecret };

export function sealSecret(plain: string): SealedSecret {
  return sealSecretBoxWithSecret(plain, sessionSecret());
}

export function openSecret(sealed: SealedSecret): string {
  return openSecretBoxWithSecret(sealed, sessionSecret());
}
