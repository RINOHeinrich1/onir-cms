/**
 * Chiffrement réversible des jetons de liens partageables (AES-256-GCM).
 * Le hash SHA-256 reste la clé de recherche ; le chiffré permet de
 * ré-afficher une URL stable sans rotation. Clé : `LINK_TOKEN_KEY`
 * (32 octets hex), jamais commise, jamais exposée au client.
 */

import { linkTokenKey } from "@/infrastructure/config/app-secrets";
import { openLinkTokenWithKey, sealLinkTokenWithKey } from "@/lib/secret-codecs";

/** Chiffre un jeton en clair → `v1:iv:donnees:tag` (hex). */
export function encryptLinkToken(token: string): string {
  return sealLinkTokenWithKey(token, linkTokenKey());
}

/** Déchiffre un jeton ; lève une erreur en cas d'altération ou de mauvaise clé. */
export function decryptLinkToken(payload: string): string {
  try {
    return openLinkTokenWithKey(payload, linkTokenKey());
  } catch {
    throw new Error("Jeton chiffré illisible");
  }
}
