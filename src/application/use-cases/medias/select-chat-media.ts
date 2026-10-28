import { NotFoundError } from "@/application/errors";
import type { AiTokenUsage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { type ChatMessageMedia, chatLinkBlockReason } from "@/domain/entities/chat";
import type { Media } from "@/domain/entities/media";
import { signedMediaUrl } from "@/lib/media-token";

/** Plafond d'entrées envoyées à la sélection (borne le coût/latence). */
export const MAX_MEDIA_CATALOGUE = 60;
/** Nombre maximum de médias proposés dans une réponse. */
export const MAX_MEDIA_RESULTS = 3;

export type SelectChatMediaDependencies = {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
  medias: MediaRepository;
  ai: AiClientFactory;
};

export type SelectChatMediaResult = {
  /** Vrai si les médias ont été calculés lors de cet appel (faux si déjà en cache). */
  computed: boolean;
  medias: ChatMessageMedia[];
};

function toMessageMedia(media: Media, organizationId: string): ChatMessageMedia {
  return {
    id: media.id,
    type: media.type,
    libelle: media.libelle,
    url: media.type === "photo" ? signedMediaUrl(media.id, organizationId) : (media.url ?? ""),
    mime: media.mime,
  };
}

function labelsFrom(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ""),
  );
}

/**
 * US-MEDIA-001 — sélection asynchrone des médias pertinents pour une réponse
 * (mini-RAG sans indexation, même mécanique que les connaissances).
 *
 * Idempotent : si le message a déjà des médias calculés (`mediasComputed`), on
 * les renvoie sans nouvel appel IA. Échec silencieux (retour `[]`) et seuls les
 * libellés connus des sources activées sur le lien sont retenus.
 */
export async function selectChatMedia(
  deps: SelectChatMediaDependencies,
  input: { conversationId: string; messageId: string },
): Promise<SelectChatMediaResult> {
  const conversation = await deps.conversations.findByIdPublic(input.conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const organizationId = conversation.organizationId;
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const message = await deps.conversations.findMessage(organizationId, input.messageId);
  if (
    message === null ||
    message.conversationId !== conversation.id ||
    message.role !== "assistant"
  ) {
    throw new NotFoundError("Message introuvable");
  }

  // Idempotence : résultat déjà calculé (y compris vide).
  if (message.mediasComputed) {
    return { computed: false, medias: message.medias };
  }

  const link = await deps.links.findById(organizationId, conversation.linkId);
  if (link === null || !link.actif) {
    return { computed: true, medias: [] };
  }
  if (chatLinkBlockReason(link) !== null) {
    await deps.conversations.setMessageMedias(organizationId, message.id, []);
    return { computed: true, medias: [] };
  }
  const ai = await deps.ai.optionalTarget({
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });
  if (ai === null) {
    await deps.conversations.setMessageMedias(organizationId, message.id, []);
    return { computed: true, medias: [] };
  }

  const recordUsage = async (operation: string, usage: AiTokenUsage): Promise<void> => {
    await deps.links.recordAiUsage?.(organizationId, link.id, {
      conversationId: conversation.id,
      operation,
      ...usage,
    });
  };
  const trackedAi = withAiUsage(ai, recordUsage, "media_selection");
  const wantsPhotos = link.sources.phototheque;
  const wantsLiens = link.sources.lien;
  const [photos, liens] = await Promise.all([
    wantsPhotos
      ? deps.medias.listActivesByType(organizationId, "photo", link.templateKey)
      : Promise.resolve([]),
    wantsLiens
      ? deps.medias.listActivesByType(organizationId, "lien", link.templateKey)
      : Promise.resolve([]),
  ]);
  if (photos.length === 0 && liens.length === 0) {
    await deps.conversations.setMessageMedias(organizationId, message.id, []);
    return { computed: true, medias: [] };
  }

  const history = await deps.conversations.listMessages(organizationId, conversation.id);
  const index = history.findIndex((entry) => entry.id === message.id);
  const before = index < 0 ? history : history.slice(0, index);
  const question = [...before].reverse().find((entry) => entry.role === "user")?.content ?? "";

  const photosCatalogue = photos.slice(0, MAX_MEDIA_CATALOGUE);
  const liensCatalogue = liens.slice(0, MAX_MEDIA_CATALOGUE);
  const catalogue = [
    photosCatalogue.length > 0
      ? `PHOTOS :\n${photosCatalogue.map((photo) => `- ${photo.libelle}`).join("\n")}`
      : "",
    liensCatalogue.length > 0
      ? `LIENS :\n${liensCatalogue.map((lien) => `- ${lien.libelle}`).join("\n")}`
      : "",
  ]
    .filter((block) => block !== "")
    .join("\n\n");

  let selection: { photos: Set<string>; liens: Set<string> };
  try {
    const raw = await trackedAi.complete({
      system: [
        "Tu sélectionnes, parmi des médias internes (photos et liens), ceux qui aident",
        "concrètement à illustrer la réponse au visiteur.",
        'Réponds UNIQUEMENT avec du JSON strict : {"photos": ["libellé exact"], "liens": ["libellé exact"]}.',
        "Listes vides si aucun média n'aide. Aucun autre texte.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Médias disponibles :\n${catalogue}\n\nQuestion du visiteur : ${
            question.trim() === "" ? "(non disponible)" : question.trim()
          }\n\nRéponse donnée : ${message.content}`,
        },
      ],
      maxTokens: 150,
    });
    const parsed: unknown = JSON.parse(raw);
    const record =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    selection = { photos: labelsFrom(record.photos), liens: labelsFrom(record.liens) };
  } catch {
    selection = { photos: new Set(), liens: new Set() };
  }

  const chosenPhotos = photosCatalogue.filter((photo) =>
    selection.photos.has(photo.libelle.trim().toLowerCase()),
  );
  const chosenLiens = liensCatalogue.filter((lien) =>
    selection.liens.has(lien.libelle.trim().toLowerCase()),
  );
  const resolved = [...chosenPhotos, ...chosenLiens]
    .slice(0, MAX_MEDIA_RESULTS)
    .map((media) => toMessageMedia(media, organizationId));

  await deps.conversations.setMessageMedias(organizationId, message.id, resolved);
  return { computed: true, medias: resolved };
}
