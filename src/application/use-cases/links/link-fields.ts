import { ValidationError } from "@/application/errors";
import {
  type ActiveLinkIdentificationMode,
  type ChatLinkQuota,
  type ChatLinkSurface,
  isActiveLinkIdentificationMode,
  isChatLinkSurface,
  isTokenResetMode,
  type TokenResetMode,
} from "@/domain/entities/chat";

/** Mode d'identification actif (contact par défaut ; OTP/interne pas encore ouverts). */
export function parseIdentificationMode(value: unknown): ActiveLinkIdentificationMode {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return "contact";
  if (isActiveLinkIdentificationMode(raw)) return raw;
  throw new ValidationError("Mode d'identification invalide");
}

/** Surface de diffusion : page (défaut) ou widget intégrable. */
export function parseSurface(value: unknown): ChatLinkSurface {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return "page";
  if (isChatLinkSurface(raw)) return raw;
  throw new ValidationError("Surface de diffusion invalide (page ou widget)");
}

/** Libellé lisible d'un lien (vide = sans nom), 120 caractères maximum. */
export function parseLabel(value: unknown): string {
  const label = typeof value === "string" ? value.trim() : "";
  if (label.length > 120) {
    throw new ValidationError("Libellé trop long (120 caractères maximum)");
  }
  return label;
}

/**
 * Normalise une expiration brute (formulaire) en ISO UTC, ou `null`.
 * Vide/absente ⇒ aucune expiration. Date seule (`AAAA-MM-JJ`, input
 * `type="date"`) ⇒ inclusive jusqu'à la FIN du jour choisi (minuit UTC du
 * lendemain) — sinon un lien « expirant aujourd'hui » naîtrait déjà mort.
 * Le passé est refusé.
 */
export function parseExpiresAt(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;

  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parsed =
    dayOnly === null
      ? new Date(raw)
      : new Date(Date.UTC(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]) + 1));
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Date d'expiration invalide");
  }
  if (parsed.getTime() <= Date.now()) {
    throw new ValidationError("La date d'expiration doit être dans le futur");
  }
  return parsed.toISOString();
}

export type LinkQuotaValues = {
  maxFiches: number | null;
  maxTokens: number | null;
  tokenResetMode: TokenResetMode;
  tokenResetDays: number | null;
};

function parseLimit(value: unknown, label: string, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
    throw new ValidationError(`${label} : entier positif ou vide attendu`);
  }
  if (number > max) {
    throw new ValidationError(`${label} : valeur maximale ${max}`);
  }
  return number;
}

/** Quotas d'un chatbot (ADR-0048), avec conservation des valeurs existantes. */
export function parseLinkQuotas(
  source: Record<string, unknown>,
  existing?: ChatLinkQuota,
): LinkQuotaValues {
  const maxFiches =
    "maxFiches" in source
      ? parseLimit(source.maxFiches, "Limite de fiches", 1_000_000)
      : (existing?.maxFiches ?? null);
  const maxTokens =
    "maxTokens" in source
      ? parseLimit(source.maxTokens, "Budget de tokens", 1_000_000_000_000)
      : (existing?.maxTokens ?? null);

  const rawMode = "tokenResetMode" in source ? source.tokenResetMode : existing?.tokenResetMode;
  const tokenResetMode: TokenResetMode =
    rawMode === undefined || rawMode === null
      ? "manual"
      : isTokenResetMode(rawMode)
        ? rawMode
        : (() => {
            throw new ValidationError("Mode de réinitialisation des tokens invalide");
          })();

  if (tokenResetMode === "manual") {
    return { maxFiches, maxTokens, tokenResetMode, tokenResetDays: null };
  }

  const rawDays = "tokenResetDays" in source ? source.tokenResetDays : existing?.tokenResetDays;
  const days = rawDays === null || rawDays === undefined || rawDays === "" ? null : Number(rawDays);
  if (days === null || !Number.isInteger(days) || days < 1 || days > 3650) {
    throw new ValidationError("Durée de réinitialisation : nombre de jours entre 1 et 3650 requis");
  }
  return { maxFiches, maxTokens, tokenResetMode, tokenResetDays: days };
}
