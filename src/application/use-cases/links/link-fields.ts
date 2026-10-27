import { ValidationError } from "@/application/errors";
import {
  type ActiveLinkIdentificationMode,
  type ChatLinkSurface,
  isActiveLinkIdentificationMode,
  isChatLinkSurface,
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
