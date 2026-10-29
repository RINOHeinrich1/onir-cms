import { NotFoundError, ValidationError } from "@/application/errors";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { MediaStorage } from "@/application/ports/media-storage";
import { mediaDto } from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";
import type { PublicApiPrincipal } from "@/application/public-api/principal";
import {
  createMediaLien,
  createMediaPhoto,
  deleteMedia,
  updateMedia,
} from "@/application/use-cases/medias/manage-medias";
import type { Media, TypeMedia } from "@/domain/entities/media";
import { actorForApi } from "./connaissances";

export type MediaListCriteria = {
  q: string | null;
  type: TypeMedia | null;
  active: boolean | null;
  chatbotId: string | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

export type MediaDependencies = {
  medias: MediaRepository;
  storage: MediaStorage;
};

function matches(media: Media, criteria: MediaListCriteria): boolean {
  if (criteria.type !== null && media.type !== criteria.type) return false;
  if (criteria.active !== null && media.actif !== criteria.active) return false;
  if (criteria.chatbotId !== null && !media.chatLinkIds.includes(criteria.chatbotId)) {
    return false;
  }
  if (criteria.q !== null) {
    const needle = criteria.q.toLowerCase();
    if (
      !`${media.libelle} ${media.description} ${media.url ?? ""}`.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
}

export async function listMediasForApi(
  deps: { medias: MediaRepository },
  organizationId: string,
  criteria: MediaListCriteria,
) {
  const rows = await deps.medias.list(organizationId);
  const page = paginateByCreatedAt(
    rows.filter((row) => matches(row, criteria)),
    criteria.limit,
    criteria.cursor,
    criteria.sort,
  );
  return {
    data: page.data.map(mediaDto),
    pagination: page.pagination,
  };
}

export async function getMediaForApi(
  deps: { medias: MediaRepository },
  organizationId: string,
  id: string,
) {
  const row = await deps.medias.findById(organizationId, id);
  if (row === null) throw new NotFoundError("Média introuvable");
  return mediaDto(row);
}

export async function createMediaLinkForApi(
  deps: { medias: MediaRepository },
  principal: PublicApiPrincipal,
  input: unknown,
) {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const type = (input as Record<string, unknown>).type;
    if (type !== undefined && type !== "lien") {
      throw new ValidationError("type doit être « lien » pour un corps JSON");
    }
  }
  const row = await createMediaLien(deps, actorForApi(principal), input);
  return mediaDto(row);
}

export async function createMediaPhotoForApi(
  deps: MediaDependencies,
  principal: PublicApiPrincipal,
  form: FormData,
) {
  const fichier = form.get("fichier");
  if (!(fichier instanceof File)) throw new ValidationError("Fichier manquant");
  const row = await createMediaPhoto(deps, actorForApi(principal), {
    meta: {
      libelle: form.get("libelle"),
      description: form.get("description"),
      chatLinkIds: form.getAll("chatLinkIds").filter((value) => typeof value === "string"),
      actif: form.get("actif") !== "false",
    },
    data: Buffer.from(await fichier.arrayBuffer()),
    contentType: fichier.type,
  });
  return mediaDto(row);
}

export async function updateMediaForApi(
  deps: { medias: MediaRepository },
  principal: PublicApiPrincipal,
  id: string,
  input: unknown,
) {
  const row = await updateMedia(deps, actorForApi(principal), id, input);
  return mediaDto(row);
}

export async function deleteMediaForApi(
  deps: MediaDependencies,
  principal: PublicApiPrincipal,
  id: string,
): Promise<void> {
  await deleteMedia(deps, actorForApi(principal), id);
}
