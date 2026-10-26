/**
 * Chiffrement des clés API fournisseurs (ADR-0029 §6).
 * AES-256-GCM avec une clé DÉDIÉE `AI_PROVIDER_KEY`, distincte de
 * `LINK_TOKEN_KEY` et de `SESSION_SECRET` : une fuite des jetons de liens ne
 * doit pas exposer les clés fournisseurs.
 */

import { aiProviderKey } from "@/infrastructure/config/app-secrets";
import {
  openAiKeyWithKey,
  type SealedAiKey,
  type SealedAiKeyWithHint,
  sealAiKeyWithKey,
} from "@/lib/secret-codecs";

export type { SealedAiKey, SealedAiKeyWithHint };

/** Chiffre une clé API. Le clair n'est jamais persisté ni journalisé. */
export function sealAiKey(plain: string): SealedAiKeyWithHint {
  return sealAiKeyWithKey(plain, aiProviderKey());
}

/** Déchiffre une clé API ; échoue si la clé maîtresse ou le chiffré est altéré. */
export function openAiKey(sealed: SealedAiKey): string {
  return openAiKeyWithKey(sealed, aiProviderKey());
}
