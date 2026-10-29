import type { TemplateDefinition } from "@/domain/entities/chat-template";

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

/** Définition locale d'une fiche manuelle, sans modèle de raisonnement. */
export const MANUAL_FICHE_KEY = "fiche-manuelle";
export const MANUAL_FICHE_DEFINITION: TemplateDefinition = {
  key: MANUAL_FICHE_KEY,
  label: "Fiche de prospection",
  description: "Fiche créée manuellement, indépendante de tout modèle de raisonnement.",
  systemPrompt: "",
  fields: [
    {
      name: "plateformes",
      label: "Plateformes",
      type: "multi",
      required: true,
      options: ["site web", "SaaS", "mobile", "automatisme background"],
    },
    { name: "description", label: "Description du projet", type: "textarea", required: true },
    { name: "budget", label: "Budget", type: "text", required: true },
    { name: "duree", label: "Durée prévue", type: "text", required: true },
    { name: "contact", label: "Contact du prospect", type: "text", required: true },
    {
      name: "statut",
      label: "Statut de lancement",
      type: "select",
      required: true,
      options: [...STATUTS_FICHE],
    },
    {
      name: "contraintesTechno",
      label: "Contraintes technologiques",
      type: "textarea",
      required: false,
      requiredIf: { field: "statut", equals: "reprendre" },
    },
    { name: "lienDocSpec", label: "Document de spécifications", type: "url", required: false },
  ],
  renderTemplate: [
    "# Fiche de prospection",
    "",
    "## Plateformes",
    "{{plateformes}}",
    "",
    "## Description",
    "{{description}}",
    "",
    "## Budget",
    "{{budget}}",
    "",
    "## Durée prévue",
    "{{duree}}",
    "",
    "## Contact",
    "{{contact}}",
    "",
    "## Statut",
    "{{statut}}",
    "",
    "{{#if contraintesTechno}}## Contraintes technologiques",
    "{{contraintesTechno}}",
    "{{/if}}",
    "{{#if lienDocSpec}}## Document de spécifications",
    "{{lienDocSpec}}",
    "{{/if}}",
  ].join("\n"),
};

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
  /** Snapshot de la définition utilisée (ADR-0055). */
  definition?: TemplateDefinition | null;
  /** Ancien modèle de raisonnement, conservé pour les fiches historiques. */
  templateKey: string | null;
  templateVersion: number | null;
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
  /** Configuration chatbot source (ADR-0049). */
  configId?: string | null;
  /** Fiche de collecte source (config-only). */
  ficheKey?: string | null;
  ficheInstanceKey?: string | null;
  /** Instance de fiche source (ADR-0049). */
  conversationFicheInstanceId?: string | null;
  /** Chatbots associés (0..N, ADR-0055). */
  chatLinkIds?: string[];
  createdAt: string;
};
