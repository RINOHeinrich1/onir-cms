/** Sélection des sources de données par lien (ADR-0026 §3). */
export interface LinkDataBindingRepository {
  /** `{ contractKey: bindingId }` — uniquement les surcharges du lien. */
  list(linkId: string): Promise<Record<string, string>>;
  /** Remplace toutes les surcharges du lien (`null` = retour au défaut). */
  replace(linkId: string, selections: Record<string, string | null>): Promise<void>;
}
