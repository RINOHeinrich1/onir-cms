import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { type Conversation, isContactType, type VisitorContact } from "@/domain/entities/chat";
import type { Prospect } from "@/domain/entities/prospect";
import { hashLinkToken } from "@/domain/link-token";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StartConversationDependencies = {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  conversations: ConversationRepository;
  prospects: ProspectRepository;
};

export type VisitorIdentity = {
  nom: string;
  email: string;
  contacts: VisitorContact[];
};

/** Valide les contacts complémentaires (téléphone, whatsapp, site web, autre). */
function parseContacts(value: unknown): VisitorContact[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5) {
    throw new ValidationError("Contacts complémentaires invalides (5 maximum)");
  }
  const contacts: VisitorContact[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ValidationError("Contacts complémentaires invalides");
    }
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const valeur = typeof record.valeur === "string" ? record.valeur.trim() : "";
    if (!isContactType(type) || valeur === "" || valeur.length > 200) {
      throw new ValidationError("Contacts complémentaires invalides");
    }
    contacts.push({ type, valeur });
  }
  return contacts;
}

/**
 * Trouve (par email, dans l'organisation du lien) ou crée le prospect du
 * visiteur. Aucune lecture inter-organisations.
 */
async function findOrCreateVisitorProspect(
  prospects: ProspectRepository,
  organizationId: string,
  visitor: { nom: string; email: string; contacts: VisitorContact[] },
  linkId: string,
): Promise<Prospect> {
  const existing = await prospects.findByEmail(organizationId, visitor.email);
  if (existing !== null) return existing;

  const nom = visitor.nom.trim();
  const detail = visitor.contacts.map((entry) => `${entry.type} : ${entry.valeur}`).join(" ; ");

  return prospects.create(organizationId, {
    nom: nom === "" ? visitor.email : nom,
    prenom: "",
    nature: "physique",
    email: visitor.email,
    activite: "",
    fonction: "",
    detail,
    createdBy: null,
    origine: "libre",
    lienId: linkId,
  });
}

export type StartedConversation = {
  conversation: Conversation;
  /** Prospect rattaché (lien spécifique, ou prospect du visiteur). */
  prospect: Prospect | null;
  /** Vrai si une conversation existante a été reprise (même lien + prospect). */
  resumed: boolean;
};

/**
 * US-LIENS-001 / US-CONVERS-001 — démarrage d'une conversation depuis un
 * jeton de lien. Le token porte l'organisation (ADR-0025 §10) ; une
 * organisation suspendue renvoie 404.
 */
export async function startConversation(
  deps: StartConversationDependencies,
  input: { token: string; visitor?: unknown; consentement?: unknown },
): Promise<StartedConversation> {
  if (typeof input.token !== "string" || input.token.trim() === "") {
    throw new ValidationError("Lien invalide");
  }

  const link = await deps.links.findByTokenHash(hashLinkToken(input.token.trim()));
  if (link === null || !link.actif) {
    throw new NotFoundError("Lien invalide ou révoqué");
  }
  if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now()) {
    throw new ValidationError("Lien expiré");
  }

  const organizationId = link.organizationId;
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new NotFoundError("Lien invalide ou révoqué");
  }

  if (link.type === "standard" && link.identificationMode === "anonymous") {
    const consentementRequis = link.confidentialiteId !== null;
    const consentement = input.consentement === true;
    if (consentementRequis && !consentement) {
      throw new ValidationError(
        "Vous devez accepter la politique de confidentialité avant de discuter",
      );
    }
    const conversation = await deps.conversations.create(organizationId, {
      linkId: link.id,
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      prospectId: null,
      consentementAt: consentementRequis ? new Date().toISOString() : null,
      confidentialiteId: consentementRequis ? link.confidentialiteId : null,
    });
    return { conversation, prospect: null, resumed: false };
  }

  if (link.type === "standard") {
    if (link.identificationMode !== "contact") {
      throw new ValidationError("Mode d'identification indisponible");
    }
    const source =
      input.visitor !== null && typeof input.visitor === "object" && !Array.isArray(input.visitor)
        ? (input.visitor as Record<string, unknown>)
        : {};
    const nom = typeof source.nom === "string" ? source.nom.trim() : "";
    const email = typeof source.email === "string" ? source.email.trim().toLowerCase() : "";
    if (nom === "" || !EMAIL_PATTERN.test(email)) {
      throw new ValidationError("Nom et email valides requis avant de discuter");
    }
    const contacts = parseContacts(source.contacts);

    const consentementRequis = link.confidentialiteId !== null;
    const consentement = input.consentement === true;
    if (consentementRequis && !consentement) {
      throw new ValidationError(
        "Vous devez accepter la politique de confidentialité avant de discuter",
      );
    }
    const consentementAt = consentementRequis && consentement ? new Date().toISOString() : null;

    const prospect = await findOrCreateVisitorProspect(
      deps.prospects,
      organizationId,
      { nom, email, contacts },
      link.id,
    );

    const existing = await deps.conversations.findOpenByLinkAndProspect(
      organizationId,
      link.id,
      prospect.id,
    );
    if (existing !== null) {
      return { conversation: existing, prospect, resumed: true };
    }
    const conversation = await deps.conversations.create(organizationId, {
      linkId: link.id,
      visitorNom: nom,
      visitorEmail: email,
      visitorContacts: contacts,
      prospectId: prospect.id,
      consentementAt,
      confidentialiteId: consentementAt !== null ? link.confidentialiteId : null,
    });
    return { conversation, prospect, resumed: false };
  }

  let prospect: Prospect | null = null;
  if (link.prospectId !== null) {
    prospect = await deps.prospects.findById(organizationId, link.prospectId);
  }
  if (prospect !== null) {
    const existing = await deps.conversations.findOpenByLinkAndProspect(
      organizationId,
      link.id,
      prospect.id,
    );
    if (existing !== null) {
      return { conversation: existing, prospect, resumed: true };
    }
  }
  const conversation = await deps.conversations.create(organizationId, {
    linkId: link.id,
    visitorNom: prospect ? `${prospect.nom} ${prospect.prenom}`.trim() : "",
    visitorEmail: prospect?.email ?? "",
    visitorContacts: [],
    prospectId: prospect?.id ?? null,
    consentementAt: null,
    confidentialiteId: null,
  });
  return { conversation, prospect, resumed: false };
}
