import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConfidentialiteRepository } from "@/application/ports/confidentialite-repository";
import type { LinkDataBindingRepository } from "@/application/ports/link-data-binding-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
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
import {
  parseExpiresAt,
  parseLabel,
  parseLinkQuotas,
} from "@/application/use-cases/links/link-fields";
import {
  type ChatLink,
  type ChatLinkType,
  isChatLinkType,
  legacyChannelFields,
  parseLinkSources,
  parseUserStateEnabled,
} from "@/domain/entities/chat";
import { generateLinkToken, hashLinkToken } from "@/domain/link-token";
import { encryptLinkToken } from "@/lib/link-crypto";

export type CreateChatLinkDependencies = {
  links: ChatLinkRepository;
  prospects: ProspectRepository;
  templates: ChatTemplateRepository;
  confidentialites: ConfidentialiteRepository;
  visualTemplates: VisualTemplateRepository;
  /** Sources de données (ADR-0026) — optionnel hors panneau. */
  bindings?: TemplateDataBindingRepository;
  linkDataBindings?: LinkDataBindingRepository;
  /** Fournisseurs IA (ADR-0029) — requis pour une affectation explicite. */
  aiProviders?: AiProviderRepository;
  aiModels?: AiProviderModelRepository;
};

export type CreatedChatLink = {
  link: ChatLink;
  /** Jeton en clair, communiqué une seule fois (jamais re-lisible ensuite). */
  token: string;
};

/**
 * US-LIENS-001 — création d'un lien de chat.
 * RM-LIEN-SPEC : type `specifique` ⇒ `prospectId` obligatoire et existant.
 * RM-LIEN-STD : type `standard` ⇒ aucun prospect rattaché.
 */
export async function createChatLink(
  deps: CreateChatLinkDependencies,
  actor: Actor,
  input: unknown,
): Promise<CreatedChatLink> {
  assertCan(actor, "links:create");
  return createChatLinkForOrganization(deps, organizationOf(actor), actor.id, input, () =>
    assertCan(actor, "ai:assign"),
  );
}

export async function createChatLinkForOrganization(
  deps: CreateChatLinkDependencies,
  organizationId: string,
  createdBy: string | null,
  input: unknown,
  canAssignAi: () => void = () => undefined,
): Promise<CreatedChatLink> {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const rawType = typeof source.type === "string" ? source.type : "";
  if (!isChatLinkType(rawType)) {
    throw new ValidationError("Type de lien invalide (specifique ou standard)");
  }
  const type: ChatLinkType = rawType;

  const rawProspectId = typeof source.prospectId === "string" ? source.prospectId.trim() : "";
  const label = parseLabel(source.label);
  const expiresAt = parseExpiresAt(source.expiresAt);

  const aiAssignment = parseAiAssignmentInput(source);
  if (aiAssignment !== null && aiAssignment.aiProviderId !== null) {
    canAssignAi();
    await assertAssignableProvider(deps, organizationId, aiAssignment);
  }

  const sources = parseLinkSources(source.sources);
  const userStateEnabled = parseUserStateEnabled(source.userStateEnabled);
  const quotas = parseLinkQuotas(source);
  const dataBindings = parseDataBindingSelections(source.dataBindings);
  const activeConfidentialites = await deps.confidentialites.listActives(organizationId);
  const channels = await resolveLinkChannels({
    type,
    source,
    defaultConfidentialiteId: activeConfidentialites[0]?.id ?? null,
    visualTemplates: deps.visualTemplates,
    organizationId,
  });
  const summary = legacyChannelFields(channels);

  const rawTemplateKey = typeof source.templateKey === "string" ? source.templateKey.trim() : "";
  const templateKey = rawTemplateKey === "" ? "fiche-projet" : rawTemplateKey;
  const template = await deps.templates.currentVersion(organizationId, templateKey);
  if (template === null) {
    throw new ValidationError(`Modèle inconnu : ${templateKey}`);
  }

  if (type === "specifique") {
    if (channels.page.identificationMode !== "contact") {
      throw new ValidationError(
        "Un lien spécifique utilise le prospect rattaché : le mode anonyme est indisponible",
      );
    }
    if (rawProspectId === "") {
      throw new ValidationError("Un lien spécifique exige un prospect rattaché");
    }
    const prospect = await deps.prospects.findById(organizationId, rawProspectId);
    if (prospect === null) {
      throw new NotFoundError("Prospect introuvable");
    }
  } else if (rawProspectId !== "") {
    throw new ValidationError("Un lien standard ne porte aucun prospect");
  }

  const token = generateLinkToken();
  const created = await deps.links.create(organizationId, {
    tokenHash: hashLinkToken(token),
    tokenEnc: encryptLinkToken(token),
    label,
    type,
    ...summary,
    prospectId: type === "specifique" ? rawProspectId : null,
    createdBy,
    expiresAt,
    templateKey,
    templateVersion: template.version,
    sources,
    userStateEnabled,
    channels,
    aiProviderId: aiAssignment?.aiProviderId ?? null,
    aiModel: aiAssignment?.aiModel ?? null,
    ...quotas,
  });
  const link: ChatLink = { ...created, channels };
  if (dataBindings !== null) {
    if (deps.bindings === undefined || deps.linkDataBindings === undefined) {
      throw new ValidationError("Sources de données indisponibles");
    }
    await applyDataBindings(
      {
        bindings: deps.bindings,
        linkDataBindings: deps.linkDataBindings,
        visualTemplates: deps.visualTemplates,
      },
      link,
      dataBindings,
    );
  }
  return { link, token };
}
