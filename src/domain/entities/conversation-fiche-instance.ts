/**
 * Instance de fiche de collecte d'une conversation (ADR-0049).
 * Une conversation peut suivre plusieurs fiches (ex. hôtel + voiture) :
 * chaque fiche possède une instance persistée (statut, données, champs
 * manquants). Une seule instance peut être `active` à la fois.
 */

export const FICHE_INSTANCE_STATUSES = [
  "detected",
  "active",
  "paused",
  "complete",
  "abandoned",
] as const;

export type FicheInstanceStatus = (typeof FICHE_INSTANCE_STATUSES)[number];

export function isFicheInstanceStatus(value: string): value is FicheInstanceStatus {
  return (FICHE_INSTANCE_STATUSES as readonly string[]).includes(value);
}

/** Statuts qui empêchent la clôture tant qu'ils ne sont pas abandonnés. */
export const PENDING_FICHE_STATUSES: readonly FicheInstanceStatus[] = [
  "detected",
  "active",
  "paused",
];

export function isPendingFicheStatus(status: FicheInstanceStatus): boolean {
  return PENDING_FICHE_STATUSES.includes(status);
}

export type ConversationFicheInstance = {
  id: string;
  organizationId: string;
  conversationId: string;
  configId: string;
  ficheKey: string;
  instanceKey: string;
  status: FicheInstanceStatus;
  data: Record<string, unknown>;
  missingFields: string[];
  abandonReason: string | null;
  detectedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export const CONVERSATION_OUTCOMES = [
  "fiches_creees",
  "sans_fiche",
  "abandonnee",
  "erreur",
] as const;

export type ConversationOutcome = (typeof CONVERSATION_OUTCOMES)[number];

export function isConversationOutcome(value: unknown): value is ConversationOutcome {
  return typeof value === "string" && (CONVERSATION_OUTCOMES as readonly string[]).includes(value);
}

/** Normalise les champs manquants (dédupliqués, non vides). */
export function normalizeMissingFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (name !== "") seen.add(name);
  }
  return [...seen];
}
