import { NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { draftTemplateDataFromConversation } from "@/application/use-cases/fiche/draft-fiche";
import type { Conversation } from "@/domain/entities/chat";
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
};

export type FinishedConversation = {
  fiche: Fiche;
  /** Document Markdown prêt à télécharger (généré côté serveur). */
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

/**
 * Construit la fiche à partir d'une conversation (IA propose les champs, la
 * validation métier tranche). Toutes les lectures sont scopées à l'organisation
 * portée par la conversation (jamais fournie par le client).
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
  const anonymousConversation =
    conversation.visitorNom.trim() === "" &&
    conversation.visitorEmail.trim() === "" &&
    conversation.prospectId === null;
  if (
    link.surface !== "widget" &&
    (link.identificationMode === "anonymous" || anonymousConversation)
  ) {
    throw new UnprocessableError("Une conversation anonyme ne génère pas de fiche nominative");
  }
  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }
  const definition = template.definition;
  const ai = await deps.ai.forTarget({
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });

  const draft = await draftTemplateDataFromConversation(
    { conversations: deps.conversations, ai },
    organizationId,
    conversation.id,
    definition,
  );

  // Prospect : rattaché à la conversation, sinon celui du lien, sinon créé.
  let prospect: Prospect | null = null;
  if (conversation.prospectId !== null) {
    prospect = await deps.prospects.findById(organizationId, conversation.prospectId);
  }
  if (prospect === null && link.prospectId !== null) {
    prospect = await deps.prospects.findById(organizationId, link.prospectId);
  }
  if (prospect === null && link.surface === "widget" && link.type === "standard") {
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

  // Contact de la fiche : widget ⇒ prospect technique ou contact collecté dans
  // le chat ; spécifique ⇒ coordonnées du prospect ; standard ⇒ visiteur.
  const contact =
    link.surface === "widget" && prospect !== null
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
    templateKey: link.templateKey,
    templateVersion: link.templateVersion,
    data: validated.value,
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
 * Finalisation d'une conversation par le visiteur (bouton « Terminer ») :
 * construit la fiche et passe la conversation au statut `finalisee`.
 * Pas de rôle dashboard requis : la possession de l'identifiant de
 * conversation (UUID imprévisible) fait office d'autorisation. L'organisation
 * est dérivée de la conversation ; une organisation suspendue renvoie 404.
 */
export async function finishConversation(
  deps: FinishConversationDependencies,
  conversationId: string,
): Promise<FinishedConversation> {
  const conversation = await deps.conversations.findByIdPublic(conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const organization = await deps.organizations.findById(conversation.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Conversation introuvable");
  }

  const result = await buildFicheFromConversation(deps, conversation, null);
  await deps.conversations.markFinalisee(conversation.organizationId, conversation.id);
  return result;
}
