/**
 * Entité métier `Fiche` (B040) — fiche de prospection livrable.
 * RM-FICHE-001 : plateformes (multi), description, budget, durée, contact,
 * statut (initier/reprendre), contraintes techno si reprise, lien doc spec.
 * Depuis les modèles DB-driven : snapshot (`templateKey`/`templateVersion`)
 * + valeurs génériques (`data`, clés = field.name). `statut` nullable pour
 * les modèles sans statut ; les colonnes historiques restent alimentées
 * pour `fiche-projet` (compatibilité).
 */

export const STATUTS_FICHE = ["initier", "reprendre"] as const;

export type StatutFiche = (typeof STATUTS_FICHE)[number];

export function isStatutFiche(value: string): value is StatutFiche {
  return (STATUTS_FICHE as readonly string[]).includes(value);
}

/** Filtre d'archivage des fiches (serveur). */
export type FicheArchiveFilter = "actives" | "archivees" | "toutes";

/** Normalise un filtre d'archivage (défaut : `actives`). */
export function parseFicheArchiveFilter(value: unknown): FicheArchiveFilter {
  return value === "archivees" || value === "toutes" ? value : "actives";
}

export type Fiche = {
  id: string;
  organizationId: string;
  conversationId: string | null;
  prospectId: string | null;
  createdBy: string | null;
  templateKey: string;
  templateVersion: number;
  data: Record<string, unknown>;
  plateformes: string[];
  description: string;
  budget: string;
  duree: string;
  contact: string;
  statut: StatutFiche | null;
  contraintesTechno: string;
  lienDocSpec: string;
  /** Fiche archivée (masquée par défaut). */
  archivee: boolean;
  createdAt: string;
};
