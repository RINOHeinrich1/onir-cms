/**
 * Politique de confidentialité (US-CONFID-001).
 * Le `texte` est le consentement affiché au visiteur avant la discussion ;
 * le `lien` (optionnel) pointe la politique complète (interne `/confidentialite`
 * ou externe). Un lien de chat est rattaché à une politique ; le consentement
 * du visiteur est horodaté sur la conversation.
 */

export const CONFIDENTIALITE_TITRE_MAX = 120;

export type Confidentialite = {
  id: string;
  organizationId: string;
  titre: string;
  texte: string;
  /** URL de la politique complète (vide = aucun lien). */
  lien: string;
  actif: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConfidentialiteValidationError = {
  field: "titre" | "texte" | "lien";
  message: string;
};

export type ConfidentialiteInput = {
  titre: string;
  texte: string;
  lien: string;
  actif: boolean;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Valide une politique de confidentialité (titre + texte requis). */
export function validateConfidentialite(
  input: unknown,
):
  | { ok: true; value: ConfidentialiteInput }
  | { ok: false; errors: ConfidentialiteValidationError[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: ConfidentialiteValidationError[] = [];

  const titre = text(source.titre);
  const texte = text(source.texte);
  const lien = text(source.lien);

  if (titre === "") {
    errors.push({ field: "titre", message: "Le titre est obligatoire" });
  } else if (titre.length > CONFIDENTIALITE_TITRE_MAX) {
    errors.push({
      field: "titre",
      message: `Titre trop long (${CONFIDENTIALITE_TITRE_MAX} caractères maximum)`,
    });
  }
  if (texte === "") {
    errors.push({ field: "texte", message: "Le texte du consentement est obligatoire" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { titre, texte, lien, actif: source.actif !== false } };
}
