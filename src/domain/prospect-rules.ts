/**
 * Règles de validation des prospects (B003) — RM-PROSPECT-001.
 * Fonctions pures et testables : aucun accès base ni framework.
 */

import { isNatureProspect, type NatureProspect, type Prospect } from "@/domain/entities/prospect";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProspectInput = {
  nom: string;
  prenom: string;
  nature: NatureProspect;
  email: string;
  activite: string;
  fonction: string;
  detail: string;
};

export type ProspectValidationError = {
  field: "nom" | "prenom" | "nature" | "email" | "activite" | "fonction" | "detail";
  message: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Valide un objet brut (corps JSON) et renvoie les champs normalisés,
 * ou la liste des erreurs de validation.
 */
export function validateProspect(
  input: unknown,
): { ok: true; value: ProspectInput } | { ok: false; errors: ProspectValidationError[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  const errors: ProspectValidationError[] = [];
  const nom = text(source.nom);
  const email = text(source.email).toLowerCase();
  const natureRaw = text(source.nature);

  if (nom === "") {
    errors.push({ field: "nom", message: "Le nom est obligatoire" });
  }
  if (email === "" || !EMAIL_PATTERN.test(email)) {
    errors.push({ field: "email", message: "Adresse email invalide" });
  }
  if (!isNatureProspect(natureRaw)) {
    errors.push({ field: "nature", message: "Nature invalide (physique ou morale)" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      nom,
      prenom: text(source.prenom),
      nature: natureRaw as NatureProspect,
      email,
      activite: text(source.activite),
      fonction: text(source.fonction),
      detail: text(source.detail),
    },
  };
}

/** Contexte textuel d'un prospect, injecté au prompt système (lien spécifique). */
export function prospectContext(prospect: Prospect): string {
  const lines = [
    `Nom : ${prospect.nom} ${prospect.prenom}`.trim(),
    `Nature : ${prospect.nature === "physique" ? "personne physique" : "personne morale"}`,
    `Email : ${prospect.email}`,
  ];
  if (prospect.activite !== "") lines.push(`Activité : ${prospect.activite}`);
  if (prospect.fonction !== "") lines.push(`Fonction : ${prospect.fonction}`);
  if (prospect.detail !== "") lines.push(`Détail : ${prospect.detail}`);
  return lines.join("\n");
}
