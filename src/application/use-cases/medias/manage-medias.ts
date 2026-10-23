import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { MediaStorage } from "@/application/ports/media-storage";
import {
  DESCRIPTION_MAX,
  LIBELLE_MAX,
  type Media,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  validateMediaLien,
  validateMediaMeta,
} from "@/domain/entities/media";
import { hasTemplateKeys, normalizeTemplateKeys } from "@/domain/entities/template-keys";

export type ManageMediasDependencies = {
  medias: MediaRepository;
};

export type MediaStorageDependencies = {
  medias: MediaRepository;
  storage: MediaStorage;
};

function joinErrors(errors: { message: string }[]): string {
  return errors.map((error) => error.message).join(" ; ");
}

/** US-MEDIA-001 — liste de la médiathèque (lecture tous rôles). */
export async function listMedias(deps: ManageMediasDependencies, actor: Actor): Promise<Media[]> {
  assertCan(actor, "medias:list");
  return deps.medias.list(organizationOf(actor));
}

/** US-MEDIA-001 — création d'un lien (libellé unique par nature). */
export async function createMediaLien(
  deps: ManageMediasDependencies,
  actor: Actor,
  input: unknown,
): Promise<Media> {
  assertCan(actor, "medias:create");
  const organizationId = organizationOf(actor);

  const validated = validateMediaLien(input);
  if (!validated.ok) {
    throw new ValidationError(joinErrors(validated.errors));
  }
  const existing = await deps.medias.findByLibelle(organizationId, "lien", validated.value.libelle);
  if (existing !== null) {
    throw new ConflictError(`Libellé déjà utilisé : ${validated.value.libelle}`);
  }

  return deps.medias.create(organizationId, {
    type: "lien",
    libelle: validated.value.libelle,
    description: validated.value.description,
    templateKeys: validated.value.templateKeys,
    actif: validated.value.actif,
    fichier: null,
    mime: null,
    url: validated.value.url,
    createdBy: actor.id,
  });
}

export type CreateMediaPhotoInput = {
  meta: unknown;
  data: Buffer;
  contentType: string;
};

/**
 * US-MEDIA-001 — import d'une photo : validation (métadonnées + format + taille),
 * stockage du fichier via le port `MediaStorage`, puis persistance. En cas d'échec
 * de la persistance, le fichier stocké est nettoyé (pas de fichier orphelin).
 */
export async function createMediaPhoto(
  deps: MediaStorageDependencies,
  actor: Actor,
  input: CreateMediaPhotoInput,
): Promise<Media> {
  assertCan(actor, "medias:create");
  const organizationId = organizationOf(actor);

  const validated = validateMediaMeta(input.meta);
  if (!validated.ok) {
    throw new ValidationError(joinErrors(validated.errors));
  }
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(input.contentType)) {
    throw new ValidationError("Format d'image non pris en charge (PNG, JPEG, WebP, GIF, AVIF)");
  }
  if (input.data.byteLength === 0) {
    throw new ValidationError("Fichier vide");
  }
  if (input.data.byteLength > PHOTO_MAX_BYTES) {
    throw new ValidationError(
      `Fichier trop volumineux (${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)} Mo maximum)`,
    );
  }

  const existing = await deps.medias.findByLibelle(
    organizationId,
    "photo",
    validated.value.libelle,
  );
  if (existing !== null) {
    throw new ConflictError(`Libellé déjà utilisé : ${validated.value.libelle}`);
  }

  const fichier = await deps.storage.save({
    data: input.data,
    contentType: input.contentType,
    organizationId,
  });
  try {
    return await deps.medias.create(organizationId, {
      type: "photo",
      libelle: validated.value.libelle,
      description: validated.value.description,
      templateKeys: validated.value.templateKeys,
      actif: validated.value.actif,
      fichier,
      mime: input.contentType,
      url: null,
      createdBy: actor.id,
    });
  } catch (error) {
    await deps.storage.remove(fichier);
    throw error;
  }
}

/** US-MEDIA-001 — modification partielle (libellé, portée, actif, URL d'un lien). */
export async function updateMedia(
  deps: ManageMediasDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<Media> {
  assertCan(actor, "medias:update");
  const organizationId = organizationOf(actor);

  const existing = await deps.medias.findById(organizationId, id);
  if (existing === null) {
    throw new NotFoundError("Média introuvable");
  }

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const patch: {
    libelle?: string;
    description?: string;
    templateKeys?: string[];
    actif?: boolean;
    url?: string;
  } = {};

  if ("libelle" in source) {
    const libelle = typeof source.libelle === "string" ? source.libelle.trim() : "";
    if (libelle === "") throw new ValidationError("Le libellé est obligatoire");
    if (libelle.length > LIBELLE_MAX) {
      throw new ValidationError(`Libellé trop long (${LIBELLE_MAX} caractères maximum)`);
    }
    const homonym = await deps.medias.findByLibelle(organizationId, existing.type, libelle);
    if (homonym !== null && homonym.id !== id) {
      throw new ConflictError(`Libellé déjà utilisé : ${libelle}`);
    }
    patch.libelle = libelle;
  }
  if ("description" in source) {
    const description =
      typeof source.description === "string"
        ? source.description.replace(/\r\n?/g, "\n").trim()
        : "";
    if (description.length > DESCRIPTION_MAX) {
      throw new ValidationError(`Description trop longue (${DESCRIPTION_MAX} caractères maximum)`);
    }
    patch.description = description;
  }
  if (hasTemplateKeys(source)) {
    const keys = normalizeTemplateKeys(
      "templateKeys" in source ? source.templateKeys : source.templateKey,
    );
    if (!keys.ok) throw new ValidationError(keys.message);
    patch.templateKeys = keys.keys;
  }
  if ("actif" in source) {
    patch.actif = source.actif === true;
  }
  if ("url" in source) {
    if (existing.type !== "lien") {
      throw new ValidationError("L'URL ne s'applique qu'à un lien");
    }
    const url = typeof source.url === "string" ? source.url.trim() : "";
    let valid = url !== "";
    try {
      const parsed = new URL(url);
      valid = valid && (parsed.protocol === "http:" || parsed.protocol === "https:");
    } catch {
      valid = false;
    }
    if (!valid) throw new ValidationError("URL invalide (http:// ou https:// attendu)");
    patch.url = url;
  }

  const updated = await deps.medias.update(organizationId, id, patch);
  if (updated === null) {
    throw new NotFoundError("Média introuvable");
  }
  return updated;
}

/** US-MEDIA-001 — suppression (le fichier photo est retiré du stockage). */
export async function deleteMedia(
  deps: MediaStorageDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "medias:delete");
  const organizationId = organizationOf(actor);

  const existing = await deps.medias.findById(organizationId, id);
  if (existing === null) {
    throw new NotFoundError("Média introuvable");
  }
  const deleted = await deps.medias.delete(organizationId, id);
  if (!deleted) {
    throw new NotFoundError("Média introuvable");
  }
  if (existing.type === "photo" && existing.fichier !== null) {
    await deps.storage.remove(existing.fichier);
  }
}
