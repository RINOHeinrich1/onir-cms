import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type {
  ChatbotDraft,
  ChatbotDraftRepository,
} from "@/application/ports/chatbot-draft-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { MediaStorage } from "@/application/ports/media-storage";
import { collectTemporaryPhotoMediaIds } from "@/domain/entities/chatbot-draft";

const LABEL_MAX = 120;

export type ChatbotDraftsDependencies = {
  drafts: ChatbotDraftRepository;
  /** Nettoyage des photos temporaires à la suppression du brouillon. */
  medias?: MediaRepository;
  storage?: MediaStorage;
};

function parseState(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("État de brouillon invalide");
  }
  return input as Record<string, unknown>;
}

function parseLabel(input: unknown): string {
  const label = typeof input === "string" ? input.trim() : "";
  if (label.length > LABEL_MAX) {
    throw new ValidationError(`Libellé trop long (${LABEL_MAX} caractères maximum)`);
  }
  return label;
}

/** Liste les brouillons de l'organisation active (admin/marketeur). */
export async function listChatbotDrafts(
  deps: ChatbotDraftsDependencies,
  actor: Actor,
): Promise<ChatbotDraft[]> {
  assertCan(actor, "links:list");
  return deps.drafts.list(organizationOf(actor));
}

/** Détail d'un brouillon (admin/marketeur). */
export async function getChatbotDraft(
  deps: ChatbotDraftsDependencies,
  actor: Actor,
  id: string,
): Promise<ChatbotDraft> {
  assertCan(actor, "links:list");
  const draft = await deps.drafts.findById(organizationOf(actor), id);
  if (draft === null) throw new NotFoundError("Brouillon introuvable");
  return draft;
}

/** Crée un brouillon (le client évite d'en créer un vide). */
export async function createChatbotDraft(
  deps: ChatbotDraftsDependencies,
  actor: Actor,
  input: unknown,
): Promise<ChatbotDraft> {
  assertCan(actor, "links:create");
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const state = parseState(source.state);
  return deps.drafts.create(organizationOf(actor), {
    label: parseLabel(source.label),
    state,
    createdBy: actor.id,
  });
}

/** Met à jour le libellé et/ou l'état du brouillon (admin/marketeur). */
export async function updateChatbotDraft(
  deps: ChatbotDraftsDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ChatbotDraft> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  const existing = await deps.drafts.findById(organizationId, id);
  if (existing === null) throw new NotFoundError("Brouillon introuvable");

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const patch: { label?: string; state?: Record<string, unknown> } = {};
  if ("label" in source) patch.label = parseLabel(source.label);
  if ("state" in source) patch.state = parseState(source.state);
  if (patch.label === undefined && patch.state === undefined) {
    throw new ValidationError("Aucun champ à mettre à jour");
  }

  const updated = await deps.drafts.update(organizationId, id, patch);
  if (updated === null) throw new NotFoundError("Brouillon introuvable");
  return updated;
}

/**
 * Supprime un brouillon et ses photos temporaires.
 * Les photos déjà finalisées (actives ou rattachées à un chatbot) sont
 * conservées : la suppression du brouillon ne peut jamais casser un chatbot.
 */
export async function deleteChatbotDraft(
  deps: ChatbotDraftsDependencies,
  actor: Actor,
  id: string,
  options: { keepMediaIds?: readonly string[] } = {},
): Promise<void> {
  assertCan(actor, "links:revoke");
  const organizationId = organizationOf(actor);
  const existing = await deps.drafts.findById(organizationId, id);
  if (existing === null) throw new NotFoundError("Brouillon introuvable");

  const deleted = await deps.drafts.delete(organizationId, id);
  if (!deleted) throw new NotFoundError("Brouillon introuvable");

  if (deps.medias === undefined || deps.storage === undefined) return;
  const keep = new Set(options.keepMediaIds ?? []);
  for (const mediaId of collectTemporaryPhotoMediaIds(existing.state)) {
    if (keep.has(mediaId)) continue;
    try {
      const media = await deps.medias.findById(organizationId, mediaId);
      if (media === null || media.type !== "photo") continue;
      if (media.actif || media.chatLinkIds.length > 0) continue;
      if (!(await deps.medias.delete(organizationId, mediaId))) continue;
      if (media.fichier !== null) await deps.storage.remove(media.fichier);
    } catch {
      // Nettoyage best-effort : la suppression du brouillon reste acquise.
    }
  }
}
