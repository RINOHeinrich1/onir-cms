/**
 * Entité métier `Connaissance` — entrée de la base de connaissances du mini-RAG.
 * Un titre unique (référencé par le LLM) + un contenu ; portée globale
 * (liste vide) ou restreinte à 1..N modèles de raisonnement.
 */

import { readTemplateKeys } from "./template-keys";

export type Connaissance = {
  id: string;
  organizationId: string;
  titre: string;
  contenu: string;
  /** Portée : vide = toutes les conversations, sinon clés des modèles. */
  templateKeys: string[];
  /** Provenance : saisie manuelle ou assistance IA (ADR-0038). */
  origin?: "manual" | "ai";
  /** Modèle à l'origine d'une connaissance IA (provenance, pas portée). */
  sourceTemplateKey?: string | null;
  aiGenerationId?: string | null;
  actif: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Référence légère d'une connaissance (métadonnée exposable, ADR-0020).
 * Ne porte JAMAIS le contenu interne : seulement la référence et le titre,
 * affichables par un template (le contenu, lui, reste côté cœur/prompt).
 */
export type ConnaissanceRef = {
  ref: string;
  titre: string;
};

/** Construit une référence exposable depuis une connaissance complète. */
export function toConnaissanceRef(connaissance: { id: string; titre: string }): ConnaissanceRef {
  return { ref: connaissance.id, titre: connaissance.titre };
}

export type ConnaissanceInput = {
  titre: string;
  contenu: string;
  templateKeys: string[];
};

export type ConnaissanceValidationError = {
  field: "titre" | "contenu" | "templateKeys";
  message: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valide un objet brut (corps JSON) et renvoie les champs normalisés,
 * ou la liste des erreurs de validation.
 */
export function validateConnaissance(
  input: unknown,
): { ok: true; value: ConnaissanceInput } | { ok: false; errors: ConnaissanceValidationError[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const errors: ConnaissanceValidationError[] = [];
  const titre = text(source.titre);
  const contenu = text(source.contenu);
  const keys = readTemplateKeys(source);

  if (titre === "") {
    errors.push({ field: "titre", message: "Le titre est obligatoire" });
  } else if (titre.length > 120) {
    errors.push({ field: "titre", message: "Titre trop long (120 caractères maximum)" });
  }
  if (contenu === "") {
    errors.push({ field: "contenu", message: "Le contenu est obligatoire" });
  }
  if (!keys.ok) {
    errors.push({ field: "templateKeys", message: keys.message });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { titre, contenu, templateKeys: keys.ok ? keys.keys : [] },
  };
}
