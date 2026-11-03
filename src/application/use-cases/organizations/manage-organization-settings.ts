import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { OrganizationSettingsRepository } from "@/application/ports/organization-settings-repository";

export const MIN_EXPIRATION_ALERT_DAYS = 0;
export const MAX_EXPIRATION_ALERT_DAYS = 365;

export type OrganizationSettingsDependencies = {
  settings: OrganizationSettingsRepository;
};

/** Lecture du seuil d'alerte d'expiration de l'organisation. */
export async function getExpirationAlertDays(
  deps: OrganizationSettingsDependencies,
  organizationId: string,
): Promise<number> {
  return deps.settings.getExpirationAlertDays(organizationId);
}

/** Mise à jour du seuil d'alerte d'expiration (réglage global à l'organisation). */
export async function updateExpirationAlertDays(
  deps: OrganizationSettingsDependencies,
  actor: Actor,
  days: number,
): Promise<number> {
  assertCan(actor, "organizations:update");
  if (
    !Number.isInteger(days) ||
    days < MIN_EXPIRATION_ALERT_DAYS ||
    days > MAX_EXPIRATION_ALERT_DAYS
  ) {
    throw new ValidationError(
      `Le seuil doit être un entier entre ${MIN_EXPIRATION_ALERT_DAYS} et ${MAX_EXPIRATION_ALERT_DAYS} jours.`,
    );
  }
  return deps.settings.setExpirationAlertDays(organizationOf(actor), days);
}
