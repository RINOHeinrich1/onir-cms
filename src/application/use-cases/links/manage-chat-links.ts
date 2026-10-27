import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { LinkDataBindingRepository } from "@/application/ports/link-data-binding-repository";
import type { TemplateDataBindingRepository } from "@/application/ports/template-data-binding-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import {
  assertAssignableProvider,
  parseAiAssignmentInput,
} from "@/application/use-cases/links/link-ai-assignment";
import { resolveLinkChannels } from "@/application/use-cases/links/link-channels";
import {
  applyDataBindings,
  parseDataBindingSelections,
} from "@/application/use-cases/links/link-data-bindings";
import { parseExpiresAt, parseLabel } from "@/application/use-cases/links/link-fields";
import {
  type ChatLink,
  channelsForLink,
  legacyChannelFields,
  parseLinkSources,
  parseUserStateEnabled,
} from "@/domain/entities/chat";
import { generateLinkToken, hashLinkToken } from "@/domain/link-token";
import { appUrl } from "@/lib/env";
import { decryptLinkToken, encryptLinkToken } from "@/lib/link-crypto";

export type ChatLinksDependencies = {
  links: ChatLinkRepository;
};

export type ManageChatLinksDependencies = ChatLinksDependencies & {
  visualTemplates: VisualTemplateRepository;
  bindings?: TemplateDataBindingRepository;
  linkDataBindings?: LinkDataBindingRepository;
  aiProviders?: AiProviderRepository;
  aiModels?: AiProviderModelRepository;
};

/** US-LIENS-001 — liste des liens (admin/marketeur). */
export async function listChatLinks(
  deps: ChatLinksDependencies,
  actor: Actor,
): Promise<ChatLink[]> {
  assertCan(actor, "links:list");
  return deps.links.list(organizationOf(actor));
}

export type CopiedChatLink = {
  link: ChatLink;
  /** Jeton en clair, recopiable à volonté (chiffré en base, jamais en clair). */
  token: string;
  /** URL partageable stable. */
  url: string;
  /**
   * Vrai si le jeton a dû être régénéré (ligne legacy sans chiffré) :
   * dans ce cas uniquement, l'ancienne URL est invalidée.
   */
  rotated: boolean;
};

/**
 * US-LIENS-001 — copie du lien d'une ligne (URL stable, sans rotation).
 * Les lignes legacy (sans chiffré) sont migrées : un nouveau jeton est
 * généré une fois, puis l'URL devient stable.
 */
export async function copyChatLink(
  deps: ChatLinksDependencies,
  actor: Actor,
  id: string,
): Promise<CopiedChatLink> {
  assertCan(actor, "links:create");
  const organizationId = organizationOf(actor);

  const existing = await deps.links.findById(organizationId, id);
  if (existing === null) {
    throw new NotFoundError("Lien introuvable");
  }
  const stored = await deps.links.getTokenEnc(organizationId, id);
  if (stored !== null) {
    try {
      const token = decryptLinkToken(stored);
      return { link: existing, token, url: `${appUrl()}/l/${token}`, rotated: false };
    } catch {
      // Chiffré illisible (clé tournée ?) : régénération ci-dessous.
    }
  }

  const token = generateLinkToken();
  const link = await deps.links.setLinkToken(organizationId, id, {
    tokenHash: hashLinkToken(token),
    tokenEnc: encryptLinkToken(token),
  });
  if (link === null) {
    throw new NotFoundError("Lien introuvable");
  }
  return { link, token, url: `${appUrl()}/l/${token}`, rotated: true };
}
/**
 * US-LIENS-001 — édition globale d'un lien (admin/marketeur) : libellé et
 * expiration. Date vide ⇒ sans expiration. Mêmes règles que la création
 * (fin de jour inclusive, passé refusé ; libellé 120 caractères maximum).
 */
export async function updateChatLink(
  deps: ManageChatLinksDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ChatLink> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  if (
    !("label" in source) &&
    !("surface" in source) &&
    !("identificationMode" in source) &&
    !("expiresAt" in source) &&
    !("sources" in source) &&
    !("confidentialiteId" in source) &&
    !("userStateEnabled" in source) &&
    !("visualTemplateId" in source) &&
    !("visualTemplateVersion" in source) &&
    !("visualTemplateConfig" in source) &&
    !("visualTemplateParams" in source) &&
    !("widgetConfig" in source) &&
    !("channels" in source) &&
    !("dataBindings" in source) &&
    !("aiProviderId" in source) &&
    !("aiModel" in source)
  ) {
    throw new NotFoundError("Rien à modifier");
  }

  const existing = await deps.links.findById(organizationId, id);
  if (existing === null) {
    throw new NotFoundError("Lien introuvable");
  }
  const existingChannels = channelsForLink(existing);
  const dataBindings = parseDataBindingSelections(source.dataBindings);
  const aiAssignment = parseAiAssignmentInput(source, {
    aiProviderId: existing.aiProviderId,
    aiModel: existing.aiModel,
  });
  if (aiAssignment !== null) {
    assertCan(actor, "ai:assign");
    await assertAssignableProvider(deps, organizationId, aiAssignment);
  }

  const channels = await resolveLinkChannels({
    type: existing.type,
    source,
    existing: existingChannels,
    visualTemplates: deps.visualTemplates,
    organizationId,
  });
  const summary = legacyChannelFields(channels);

  const updatedRaw = await deps.links.updateDetails(organizationId, id, {
    label: "label" in source ? parseLabel(source.label) : existing.label,
    ...summary,
    expiresAt: "expiresAt" in source ? parseExpiresAt(source.expiresAt) : existing.expiresAt,
    sources: "sources" in source ? parseLinkSources(source.sources) : existing.sources,
    userStateEnabled:
      "userStateEnabled" in source
        ? parseUserStateEnabled(source.userStateEnabled)
        : existing.userStateEnabled,
    channels,
    aiProviderId: aiAssignment === null ? existing.aiProviderId : aiAssignment.aiProviderId,
    aiModel: aiAssignment === null ? existing.aiModel : aiAssignment.aiModel,
  });
  if (updatedRaw === null) {
    throw new NotFoundError("Lien introuvable");
  }
  const updated: ChatLink = { ...updatedRaw, channels };

  const templateChanged =
    updated.visualTemplateId !== existing.visualTemplateId ||
    updated.visualTemplateVersion !== existing.visualTemplateVersion;
  if (dataBindings !== null || templateChanged) {
    if (deps.bindings === undefined || deps.linkDataBindings === undefined) {
      throw new NotFoundError("Lien introuvable");
    }
    await applyDataBindings(
      {
        bindings: deps.bindings,
        linkDataBindings: deps.linkDataBindings,
        visualTemplates: deps.visualTemplates,
      },
      updated,
      dataBindings ?? {},
    );
  }
  return updated;
}

/**
 * US-LIENS-001 — suppression définitive d'un lien (avec ses conversations
 * en cascade). Remplace la révocation : l'utilisateur attend une vraie
 * suppression, pas une ligne conservée.
 */
export async function deleteChatLink(
  deps: ChatLinksDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "links:revoke");

  const deleted = await deps.links.delete(organizationOf(actor), id);
  if (!deleted) {
    throw new NotFoundError("Lien introuvable");
  }
}
