/**
 * Entité métier `Media` — élément de la médiathèque du mini-RAG.
 * Deux natures : `photo` (fichier importé, libellé, stocké hors base) et
 * `lien` (URL externe). Libellé unique par nature (référencé tel quel par le
 * LLM), portée globale (liste vide) ou restreinte à 1..N modèles.
 *
 * Même principe que la base de connaissances (US-MEDIA-001).
 */

import { readTemplateKeys } from "./template-keys";

export const TYPES_MEDIA = ["photo", "lien"] as const;

export type TypeMedia = (typeof TYPES_MEDIA)[number];

export function isTypeMedia(value: string): value is TypeMedia {
  return (TYPES_MEDIA as readonly string[]).includes(value);
}

/** Longueur maximale d'un libellé (aligné sur le titre des connaissances). */
export const LIBELLE_MAX = 120;

/** Longueur maximale de la description longue / discussion. */
export const DESCRIPTION_MAX = 2000;

/** Types MIME d'image acceptés à l'import. */
export const PHOTO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** Taille maximale d'un fichier photo (6 Mio). */
export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;

export type Media = {
  id: string;
  organizationId: string;
  type: TypeMedia;
  libelle: string;
  /** Description longue / discussion libre ; le libellé reste court. */
  description: string;
  /** Portée : vide = toutes les conversations, sinon clés des modèles. */
  templateKeys: string[];
  actif: boolean;
  /** Photo : clé de stockage du fichier (hors base) ; lien : null. */
  fichier: string | null;
  /** Photo : type MIME du fichier ; lien : null. */
  mime: string | null;
  /** Lien : URL externe ; photo : null. */
  url: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaValidationError = {
  field: "libelle" | "description" | "url" | "templateKeys";
  message: string;
};

export type MediaMeta = {
  libelle: string;
  description: string;
  templateKeys: string[];
  actif: boolean;
};

export type MediaLienInput = MediaMeta & { url: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMeta(source: Record<string, unknown>): {
  errors: MediaValidationError[];
  meta: MediaMeta;
} {
  const errors: MediaValidationError[] = [];
  const libelle = text(source.libelle);
  // Texte brut multiligne : fins de ligne normalisées, contenu interne conservé.
  const description = text(source.description).replace(/\r\n?/g, "\n");
  const keys = readTemplateKeys(source);

  if (libelle === "") {
    errors.push({ field: "libelle", message: "Le libellé est obligatoire" });
  } else if (libelle.length > LIBELLE_MAX) {
    errors.push({
      field: "libelle",
      message: `Libellé trop long (${LIBELLE_MAX} caractères maximum)`,
    });
  }

  if (description.length > DESCRIPTION_MAX) {
    errors.push({
      field: "description",
      message: `Description trop longue (${DESCRIPTION_MAX} caractères maximum)`,
    });
  }

  if (!keys.ok) {
    errors.push({ field: "templateKeys", message: keys.message });
  }

  return {
    errors,
    meta: {
      libelle,
      description,
      templateKeys: keys.ok ? keys.keys : [],
      actif: source.actif !== false,
    },
  };
}

/** Valide les champs communs (libellé, portée, actif) d'un média. */
export function validateMediaMeta(
  input: unknown,
): { ok: true; value: MediaMeta } | { ok: false; errors: MediaValidationError[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const { errors, meta } = normalizeMeta(source);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: meta };
}

/** Valide une entrée de type `lien` (métadonnées + URL http/https). */
export function validateMediaLien(
  input: unknown,
): { ok: true; value: MediaLienInput } | { ok: false; errors: MediaValidationError[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const { errors, meta } = normalizeMeta(source);

  const url = text(source.url);
  if (url === "") {
    errors.push({ field: "url", message: "L'URL est obligatoire" });
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.push({ field: "url", message: "L'URL doit commencer par http:// ou https://" });
      }
    } catch {
      errors.push({ field: "url", message: "URL invalide" });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { ...meta, url } };
}
