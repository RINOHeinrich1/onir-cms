import { ChatbotBlockedError, NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiTokenUsage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationFieldRepository } from "@/application/ports/conversation-field-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { assertChatLinkAvailable } from "@/application/use-cases/chat/chat-link-quota";
import {
  ficheToDefinition,
  findFiche,
  normalizeFicheData,
  resolveCurrentConfig,
} from "@/application/use-cases/chat/chatbot-config-runtime";
import {
  ensureMonoFicheInstance,
  instanceForFiche,
} from "@/application/use-cases/chat/fiche-instances";
import { draftTemplateDataWithClients } from "@/application/use-cases/fiche/draft-fiche";
import { type ChatLink, type Conversation, channelsForLink } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import {
  type ConversationOutcome,
  isPendingFicheStatus,
} from "@/domain/entities/conversation-fiche-instance";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";
import { renderTemplateMarkdown } from "@/domain/render-template";
import { buildServerVariables } from "@/domain/template-variables";
import { validateTemplateData } from "@/domain/validate-template-data";
import { attachmentMarkdownLink } from "@/lib/attachment-links";

export type FinishConversationDependencies = {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
  prospects: ProspectRepository;
  fiches: FicheRepository;
  templates: ChatTemplateRepository;
  attachments: AttachmentRepository;
  ai: AiClientFactory;
  /** Valeurs collectées et éditées dans le panneau d'informations (ADR-0045). */
  conversationFields?: ConversationFieldRepository;
  /** Configuration chatbot autonome (ADR-0049). */
  configs?: ChatbotConfigRepository;
  /** Registre des instances de fiches (ADR-0049). */
  ficheInstances?: ConversationFicheInstanceRepository;
};

export type FinishedFiche = {
  fiche: Fiche;
  /** Document Markdown prêt à télécharger (généré côté serveur). */
  markdown: string;
};

/**
 * Résultat unifié : 0..N fiches + résultat de la conversation.
 * `fiche`/`markdown` restent exposés pour la compatibilité (première fiche).
 */
export type FinishedConversation = {
  fiches: FinishedFiche[];
  outcome: ConversationOutcome;
  fiche: Fiche | null;
  markdown: string;
};

/** Nom du prospect technique créé pour une conversation widget standard. */
function widgetProspectName(link: { label: string }): string {
  const label = link.label.trim();
  return `Prospect issu du widget : ${label === "" ? "sans libellé" : label}`;
}

/** Extrait un email exploitable du contact proposé par l'IA, sans le deviner. */
function extractEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0].toLowerCase() ?? "";
}

/** Formate les contacts connus (visiteur ou prospect) pour la fiche. */
function formatContact(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" — ");
}

/**
 * Prospect du visiteur (lien standard) : recherché par email dans l'organisation
 * du lien, créé au besoin. Aucune lecture inter-organisations.
 */
async function ensureVisitorProspect(
  prospects: ProspectRepository,
  organizationId: string,
  conversation: {
    visitorNom: string;
    visitorEmail: string;
    visitorContacts: { type: string; valeur: string }[];
  },
  linkId: string,
): Promise<Prospect | null> {
  const email = conversation.visitorEmail.trim().toLowerCase();
  if (email === "") return null;

  const existing = await prospects.findByEmail(organizationId, email);
  if (existing !== null) return existing;

  const nom = conversation.visitorNom.trim();
  const detail = conversation.visitorContacts
    .map((entry) => `${entry.type} : ${entry.valeur}`)
    .join(" ; ");

  return prospects.create(organizationId, {
    nom: nom === "" ? email : nom,
    prenom: "",
    nature: "physique",
    email,
    activite: "",
    fonction: "",
    detail,
    createdBy: null,
    origine: "libre",
    lienId: linkId,
  });
}

/** Garde métier : une conversation anonyme ne génère pas de fiche nominative. */
function assertNamedConversation(link: ChatLink, conversation: Conversation): void {
  const channelKind = conversation.channel ?? link.surface;
  const channel = channelsForLink(link)[channelKind];
  const anonymousConversation =
    conversation.visitorNom.trim() === "" &&
    conversation.visitorEmail.trim() === "" &&
    conversation.prospectId === null;
  if (
    channelKind !== "widget" &&
    (channel.identificationMode === "anonymous" || anonymousConversation)
  ) {
    throw new UnprocessableError("Une conversation anonyme ne génère pas de fiche nominative");
  }
}

type FicheBuildMeta = {
  templateKey: string | null;
  templateVersion: number | null;
  definition: TemplateDefinition;
  configId?: string | null;
  ficheKey?: string | null;
  ficheInstanceKey?: string | null;
  conversationFicheInstanceId?: string | null;
  instanceData?: Record<string, unknown>;
};

async function buildFicheForDefinition(
  deps: FinishConversationDependencies,
  conversation: Conversation,
  link: Awaited<ReturnType<ChatLinkRepository["findById"]>>,
  definition: TemplateDefinition,
  meta: FicheBuildMeta,
  createdBy: string | null,
  fixedProspect?: Prospect | null,
): Promise<FinishedFiche> {
  if (link === null) throw new NotFoundError("Lien introuvable");
  const organizationId = conversation.organizationId;
  const channelKind = conversation.channel ?? link.surface;
  const target = {
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  };
  const clients = deps.ai.forExtraction
    ? await deps.ai.forExtraction(target, link.id)
    : [{ label: "lien", client: await deps.ai.forTarget(target) }];
  const recordUsage = async (operation: string, usage: AiTokenUsage): Promise<void> => {
    await deps.links.recordAiUsage?.(organizationId, link.id, {
      conversationId: conversation.id,
      operation,
      ...usage,
    });
  };
  const trackedClients = clients.map((entry) => ({
    ...entry,
    client: withAiUsage(entry.client, recordUsage, "fiche_extraction"),
  }));
  const aiDraft = await draftTemplateDataWithClients(
    { conversations: deps.conversations },
    trackedClients,
    organizationId,
    conversation.id,
    definition,
  );
  const draft: Record<string, unknown> = { ...aiDraft, ...(meta.instanceData ?? {}) };
  if (meta.conversationFicheInstanceId === undefined && deps.conversationFields !== undefined) {
    const collected = await deps.conversationFields.list(organizationId, conversation.id);
    for (const entry of collected) {
      draft[entry.fieldName] = entry.value;
    }
  }

  // Prospect : partagé en mode config-only, résolu ici en mode legacy.
  let prospect: Prospect | null = null;
  if (fixedProspect !== undefined) {
    prospect = fixedProspect;
  } else {
    if (conversation.prospectId !== null) {
      prospect = await deps.prospects.findById(organizationId, conversation.prospectId);
    }
    if (prospect === null && link.prospectId !== null) {
      prospect = await deps.prospects.findById(organizationId, link.prospectId);
    }
    if (prospect === null && channelKind === "widget" && link.type === "standard") {
      const rawContact = typeof draft.contact === "string" ? draft.contact.trim() : "";
      prospect = await deps.prospects.create(organizationId, {
        nom: widgetProspectName(link),
        prenom: "",
        nature: "physique",
        email: extractEmail(draft.contact),
        activite: "",
        fonction: "",
        detail: rawContact,
        createdBy: null,
        origine: "libre",
        lienId: link.id,
      });
    }
    if (prospect === null) {
      prospect = await ensureVisitorProspect(deps.prospects, organizationId, conversation, link.id);
    }
  }

  // Contact de la fiche : widget ⇒ prospect technique ou contact collecté dans
  // le chat ; spécifique ⇒ coordonnées du prospect ; standard ⇒ visiteur.
  const contact =
    channelKind === "widget" && prospect !== null
      ? formatContact([prospect.nom, prospect.email, prospect.detail])
      : link.type === "specifique" && prospect !== null
        ? formatContact([
            `${prospect.nom} ${prospect.prenom}`.trim(),
            prospect.email,
            prospect.fonction,
          ])
        : formatContact([
            conversation.visitorNom,
            conversation.visitorEmail,
            ...conversation.visitorContacts.map((entry) => `${entry.type} : ${entry.valeur}`),
          ]);

  const merged: Record<string, unknown> = { ...draft };
  if (definition.fields.some((field) => field.name === "contact") && contact !== "") {
    merged.contact = contact;
  }

  const conversationAttachments = await deps.attachments.listByConversation(
    organizationId,
    conversation.id,
  );
  const attachmentCounts: Record<string, number> = {};
  const fileValues: Record<string, string[]> = {};
  for (const attachment of conversationAttachments) {
    attachmentCounts[attachment.fieldName] = (attachmentCounts[attachment.fieldName] ?? 0) + 1;
    const names = fileValues[attachment.fieldName] ?? [];
    names.push(attachmentMarkdownLink(attachment.originalName, attachment.id));
    fileValues[attachment.fieldName] = names;
  }

  const validated = validateTemplateData(definition, merged, attachmentCounts);
  if (!validated.ok) {
    throw new UnprocessableError(validated.errors.join(" ; "));
  }

  const fiche = await deps.fiches.create(organizationId, {
    conversationId: conversation.id,
    prospectId: prospect?.id ?? null,
    createdBy,
    templateKey: meta.templateKey,
    templateVersion: meta.templateVersion,
    definition: meta.definition,
    chatLinkIds: [link.id],
    data: validated.value,
    ...(meta.configId === undefined ? {} : { configId: meta.configId }),
    ...(meta.ficheKey === undefined ? {} : { ficheKey: meta.ficheKey }),
    ...(meta.ficheInstanceKey === undefined ? {} : { ficheInstanceKey: meta.ficheInstanceKey }),
    ...(meta.conversationFicheInstanceId === undefined
      ? {}
      : { conversationFicheInstanceId: meta.conversationFicheInstanceId }),
  });
  await deps.attachments.attachToFiche(organizationId, fiche.id, conversationAttachments);

  const serverVars = buildServerVariables({ mode: link.type, prospect, conversation });
  const markdown = renderTemplateMarkdown({
    definition,
    data: validated.value,
    serverVars,
    date: fiche.createdAt.slice(0, 10),
    fileValues,
  });
  return { fiche, markdown };
}

/**
 * Construit la fiche legacy (mode modèle) à partir d'une conversation.
 * Conservé pour la génération opérateur et la compatibilité.
 */
export async function buildFicheFromConversation(
  deps: FinishConversationDependencies,
  conversation: Conversation,
  createdBy: string | null,
): Promise<FinishedConversation> {
  const organizationId = conversation.organizationId;
  const link = await deps.links.findById(organizationId, conversation.linkId);
  if (link === null) {
    throw new NotFoundError("Lien introuvable");
  }
  assertChatLinkAvailable(link);
  assertNamedConversation(link, conversation);
  const config = await resolveCurrentConfig(deps.configs, organizationId, link);
  if (config !== null) {
    return finishConfigConversation(deps, conversation, link, config, {
      abandonPending: false,
      createdBy,
      finalize: false,
    });
  }
  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }

  const reserved =
    deps.links.reserveFiche === undefined
      ? true
      : await deps.links.reserveFiche(organizationId, link.id);
  if (!reserved) {
    throw new ChatbotBlockedError(
      "Ce chatbot a atteint sa limite de fiches. Contactez l'équipe pour l'augmenter.",
    );
  }
  try {
    const built = await buildFicheForDefinition(
      deps,
      conversation,
      link,
      template.definition,
      {
        templateKey: link.templateKey,
        templateVersion: link.templateVersion,
        definition: template.definition,
      },
      createdBy,
    );
    return {
      fiches: [built],
      outcome: "fiches_creees",
      fiche: built.fiche,
      markdown: built.markdown,
    };
  } catch (error) {
    await deps.links.releaseFiche?.(organizationId, link.id);
    throw error;
  }
}

/** Réserve N fiches (atomique si le repository le permet). */
async function reserveFiches(
  deps: FinishConversationDependencies,
  link: { id: string; organizationId: string },
  count: number,
): Promise<boolean> {
  if (count <= 0) return true;
  if (deps.links.reserveFiches !== undefined) {
    return deps.links.reserveFiches(link.organizationId, link.id, count);
  }
  if (deps.links.reserveFiche === undefined) return true;
  let reserved = 0;
  for (let index = 0; index < count; index += 1) {
    const ok = await deps.links.reserveFiche(link.organizationId, link.id);
    if (!ok) {
      await deps.links.releaseFiches?.(link.organizationId, link.id, reserved);
      for (let release = 0; release < reserved; release += 1) {
        await deps.links.releaseFiche?.(link.organizationId, link.id);
      }
      return false;
    }
    reserved += 1;
  }
  return true;
}

async function releaseReserved(
  deps: FinishConversationDependencies,
  link: { id: string; organizationId: string },
  count: number,
): Promise<void> {
  if (count <= 0) return;
  if (deps.links.releaseFiches !== undefined) {
    await deps.links.releaseFiches(link.organizationId, link.id, count);
    return;
  }
  for (let index = 0; index < count; index += 1) {
    await deps.links.releaseFiche?.(link.organizationId, link.id);
  }
}

async function resolveSharedProspect(
  deps: FinishConversationDependencies,
  conversation: Conversation,
  link: NonNullable<Awaited<ReturnType<ChatLinkRepository["findById"]>>>,
): Promise<Prospect | null> {
  const organizationId = conversation.organizationId;
  if (conversation.prospectId !== null) {
    const found = await deps.prospects.findById(organizationId, conversation.prospectId);
    if (found !== null) return found;
  }
  if (link.prospectId !== null) {
    const found = await deps.prospects.findById(organizationId, link.prospectId);
    if (found !== null) return found;
  }
  const channelKind = conversation.channel ?? link.surface;
  if (channelKind === "widget" && link.type === "standard") {
    return deps.prospects.create(organizationId, {
      nom: widgetProspectName(link),
      prenom: "",
      nature: "physique",
      email: conversation.visitorEmail.trim().toLowerCase(),
      activite: "",
      fonction: "",
      detail: conversation.visitorContacts
        .map((entry) => `${entry.type} : ${entry.valeur}`)
        .join(" ; "),
      createdBy: null,
      origine: "libre",
      lienId: link.id,
    });
  }
  return ensureVisitorProspect(deps.prospects, organizationId, conversation, link.id);
}

/**
 * Mode config-only : génère 0..N fiches, une par instance complète.
 * Mono-fiche ⇒ l'instance active est clôturée et générée. Multi-fiches ⇒
 * toute instance détectée/active/paused doit être explicitement abandonnée.
 */
async function finishConfigConversation(
  deps: FinishConversationDependencies,
  conversation: Conversation,
  link: NonNullable<Awaited<ReturnType<ChatLinkRepository["findById"]>>>,
  config: ChatbotConfig,
  options: { abandonPending: boolean; createdBy: string | null; finalize: boolean },
): Promise<FinishedConversation> {
  const organizationId = conversation.organizationId;
  const instancesRepo = deps.ficheInstances;
  let instances =
    instancesRepo === undefined
      ? []
      : await instancesRepo.listByConversation(organizationId, conversation.id);
  const monoFiche = config.fiches.length === 1;
  let abandonedAny = false;

  if (monoFiche) {
    const primary = config.fiches[0];
    if (primary !== undefined && instancesRepo !== undefined) {
      let instance = instanceForFiche(instances, primary.key);
      if (instance === null) {
        instance = await ensureMonoFicheInstance(
          instancesRepo,
          config,
          conversation.id,
          organizationId,
        );
      }
      if (instance !== null && instance.status !== "complete" && instance.status !== "abandoned") {
        instance = await instancesRepo.update(organizationId, instance.id, {
          status: "complete",
          completed: true,
        });
      }
      instances = instance === null ? instances : [instance];
    }
  } else {
    const pending = instances.filter((instance) => isPendingFicheStatus(instance.status));
    if (pending.length > 0) {
      if (!options.abandonPending) {
        const labels = pending
          .map((instance) => findFiche(config, instance.ficheKey)?.label ?? instance.ficheKey)
          .join(", ");
        throw new UnprocessableError(
          `Des fiches sont encore en cours (${labels}). Abandonnez-les explicitement avant de terminer.`,
        );
      }
      abandonedAny = true;
      if (instancesRepo !== undefined) {
        for (const instance of pending) {
          await instancesRepo.update(organizationId, instance.id, {
            status: "abandoned",
            abandonReason: "Clôture explicite du visiteur",
            completed: false,
          });
        }
        instances = await instancesRepo.listByConversation(organizationId, conversation.id);
      }
    }
  }

  const targets = instances.filter((instance) => instance.status === "complete");

  if (targets.length === 0) {
    const outcome: ConversationOutcome = abandonedAny ? "abandonnee" : "sans_fiche";
    if (options.finalize) {
      await deps.conversations.setOutcome?.(organizationId, conversation.id, outcome);
      await deps.conversations.markFinalisee(organizationId, conversation.id);
    }
    return { fiches: [], outcome, fiche: null, markdown: "" };
  }

  for (const instance of targets) {
    const already = await deps.fiches.findByInstance?.(organizationId, instance.id);
    if (already !== null && already !== undefined) {
      throw new UnprocessableError("Une fiche a déjà été générée pour cette instance de collecte.");
    }
  }

  const prepared = targets.map((instance) => {
    const ficheDefinition =
      findFiche(config, instance.ficheKey) ?? (monoFiche ? (config.fiches[0] ?? null) : null);
    if (ficheDefinition === null) return null;
    const definition = ficheToDefinition(config, ficheDefinition);
    const data = normalizeFicheData(ficheDefinition, instance.data);
    const validation = validateTemplateData(
      {
        ...definition,
        fields: definition.fields.filter(
          (field) => field.type !== "file" && field.name !== "contact",
        ),
      },
      data,
    );
    if (!validation.ok) {
      throw new UnprocessableError(validation.errors.join(" ; "));
    }
    return { instance, ficheDefinition, definition, data };
  });

  const reserved = await reserveFiches(deps, link, targets.length);
  if (!reserved) {
    throw new ChatbotBlockedError(
      "Ce chatbot a atteint sa limite de fiches. Contactez l'équipe pour l'augmenter.",
    );
  }

  const sharedProspect = await resolveSharedProspect(deps, conversation, link);
  const built: FinishedFiche[] = [];
  try {
    for (const entry of prepared) {
      if (entry === null) continue;
      const { instance, ficheDefinition, definition, data } = entry;
      const result = await buildFicheForDefinition(
        deps,
        conversation,
        link,
        definition,
        {
          templateKey: null,
          templateVersion: null,
          definition,
          configId: config.id,
          ficheKey: ficheDefinition.key,
          ficheInstanceKey: instance.instanceKey,
          conversationFicheInstanceId: instance.id,
          instanceData: data,
        },
        options.createdBy,
        sharedProspect,
      );
      built.push(result);
      await instancesRepo?.update(organizationId, instance.id, {
        status: "complete",
        completed: true,
      });
    }
  } catch (error) {
    await releaseReserved(deps, link, targets.length - built.length);
    throw error;
  }

  if (built.length === 0) {
    await releaseReserved(deps, link, targets.length);
    const outcome: ConversationOutcome = abandonedAny ? "abandonnee" : "sans_fiche";
    if (options.finalize) {
      await deps.conversations.setOutcome?.(organizationId, conversation.id, outcome);
      await deps.conversations.markFinalisee(organizationId, conversation.id);
    }
    return { fiches: [], outcome, fiche: null, markdown: "" };
  }

  if (options.finalize) {
    await deps.conversations.setOutcome?.(organizationId, conversation.id, "fiches_creees");
    await deps.conversations.markFinalisee(organizationId, conversation.id);
  }
  return {
    fiches: built,
    outcome: "fiches_creees",
    fiche: built[0]?.fiche ?? null,
    markdown: built[0]?.markdown ?? "",
  };
}

/**
 * Finalisation d'une conversation par le visiteur (bouton « Terminer ») :
 * génère 0..N fiches et passe la conversation au statut `finalisee`.
 * Pas de rôle dashboard requis : la possession de l'identifiant de
 * conversation (UUID imprévisible) fait office d'autorisation. L'organisation
 * est dérivée de la conversation ; une organisation suspendue renvoie 404.
 */
export async function finishConversation(
  deps: FinishConversationDependencies,
  conversationId: string,
  options: { abandonPending?: boolean } = {},
): Promise<FinishedConversation> {
  const conversation = await deps.conversations.findByIdPublic(conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const organization = await deps.organizations.findById(conversation.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Conversation introuvable");
  }

  const link = await deps.links.findById(conversation.organizationId, conversation.linkId);
  if (link === null) {
    throw new NotFoundError("Lien introuvable");
  }
  assertChatLinkAvailable(link);
  const config = await resolveCurrentConfig(deps.configs, conversation.organizationId, link);
  if (config !== null) {
    assertNamedConversation(link, conversation);
    return finishConfigConversation(deps, conversation, link, config, {
      abandonPending: options.abandonPending === true,
      createdBy: null,
      finalize: true,
    });
  }

  const result = await buildFicheFromConversation(deps, conversation, null);
  await deps.conversations.setOutcome?.(
    conversation.organizationId,
    conversation.id,
    result.outcome,
  );
  await deps.conversations.markFinalisee(conversation.organizationId, conversation.id);
  return result;
}
