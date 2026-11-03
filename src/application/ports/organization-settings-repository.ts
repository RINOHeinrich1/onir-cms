/** Réglages transverses d'une organisation (indépendants de la configuration d'un chatbot). */
export interface OrganizationSettingsRepository {
  /** Seuil d'alerte d'expiration, en jours (0 = alerte désactivée). */
  getExpirationAlertDays(organizationId: string): Promise<number>;
  setExpirationAlertDays(organizationId: string, days: number): Promise<number>;
}
