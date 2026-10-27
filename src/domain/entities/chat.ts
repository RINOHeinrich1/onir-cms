/**
 * Entités métier du chat (B015) — isolées du framework et de la persistance.
 * RM-LIEN-SPEC : lien `specifique` rattaché à un prospect (contexte IA).
 * RM-LIEN-STD : lien `standard`, visiteur identifié avant discussion.
 */

import type { AttachmentView } from "@/domain/entities/attachment";
import { normalizeTemplateParamValues, type TemplateParamValues } from "@/domain/template-params";
import { type ChatLinkWidgetConfig, parseChatLinkWidgetConfig } from "@/domain/widget";

export const CHAT_LINK_TYPES = ["specifique", "standard"] as const;

export type ChatLinkType = (typeof CHAT_LINK_TYPES)[number];

export function isChatLinkType(value: string): value is ChatLinkType {
  return (CHAT_LINK_TYPES as readonly string[]).includes(value);
}

/** Surface de diffusion du lien (ADR-0040). */
export const CHAT_LINK_SURFACES = ["page", "widget"] as const;
export type ChatLinkSurface = (typeof CHAT_LINK_SURFACES)[number];

export function isChatLinkSurface(value: string): value is ChatLinkSurface {
  return (CHAT_LINK_SURFACES as readonly string[]).includes(value);
}

/** Configuration d'un canal de diffusion (ADR-0041). */
export type ChatLinkChannel = {
  channel: ChatLinkSurface;
  enabled: boolean;
  identificationMode: ActiveLinkIdentificationMode;
  confidentialiteId: string | null;
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  visualTemplateConfig: Record<string, string>;
  visualTemplateParams: TemplateParamValues;
  widgetConfig: ChatLinkWidgetConfig;
};

export type ChatLinkChannels = Record<ChatLinkSurface, ChatLinkChannel>;

/** Valeurs par défaut d'un canal, utilisé par l'UI et les lignes legacy. */
export function emptyChatLinkChannel(
  channel: ChatLinkSurface,
  type: ChatLinkType,
): ChatLinkChannel {
  return {
    channel,
    enabled: false,
    identificationMode: channel === "widget" && type === "standard" ? "anonymous" : "contact",
    confidentialiteId: null,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
  };
}

/**
 * Canaux d'un lien, avec repli sur les colonnes historiques (`surface`) tant
 * que la migration de compatibilité n'est pas terminée.
 */
export function channelsForLink(link: ChatLink): ChatLinkChannels {
  if (link.channels !== undefined) return link.channels;
  const base = {
    identificationMode: link.identificationMode,
    confidentialiteId: link.confidentialiteId,
    visualTemplateId: link.visualTemplateId,
    visualTemplateVersion: link.visualTemplateVersion,
    visualTemplateConfig: link.visualTemplateConfig,
    visualTemplateParams: link.visualTemplateParams,
  };
  return {
    page: {
      channel: "page",
      enabled: link.surface === "page",
      ...base,
      widgetConfig: {},
    },
    widget: {
      channel: "widget",
      enabled: link.surface === "widget",
      ...base,
      identificationMode: link.type === "standard" ? "anonymous" : link.identificationMode,
      confidentialiteId: null,
      widgetConfig: link.widgetConfig,
    },
  };
}

/** Champs historiques (surface, template, identification) dérivés des canaux. */
export function legacyChannelFields(
  channels: ChatLinkChannels,
): Pick<
  ChatLink,
  | "surface"
  | "identificationMode"
  | "confidentialiteId"
  | "visualTemplateId"
  | "visualTemplateVersion"
  | "visualTemplateConfig"
  | "visualTemplateParams"
  | "widgetConfig"
> {
  const active = channels.page.enabled
    ? channels.page
    : channels.widget.enabled
      ? channels.widget
      : channels.page;
  return {
    surface: active.channel,
    identificationMode: active.identificationMode,
    confidentialiteId: active.confidentialiteId,
    visualTemplateId: active.visualTemplateId,
    visualTemplateVersion: active.visualTemplateVersion,
    visualTemplateConfig: active.visualTemplateConfig,
    visualTemplateParams: active.visualTemplateParams,
    widgetConfig: channels.widget.widgetConfig,
  };
}

/** Modes d'identification stockés (ADR-0033). OTP/interne réservés. */
export const CHAT_LINK_IDENTIFICATION_MODES = ["contact", "anonymous", "otp", "internal"] as const;

/** Modes réellement ouverts à la configuration. */
export const ACTIVE_LINK_IDENTIFICATION_MODES = ["contact", "anonymous"] as const;

export type ChatLinkIdentificationMode = (typeof CHAT_LINK_IDENTIFICATION_MODES)[number];
export type ActiveLinkIdentificationMode = (typeof ACTIVE_LINK_IDENTIFICATION_MODES)[number];

export function isActiveLinkIdentificationMode(
  value: string,
): value is ActiveLinkIdentificationMode {
  return (ACTIVE_LINK_IDENTIFICATION_MODES as readonly string[]).includes(value);
}

/**
 * Sources de données recherchées lors de la génération de réponse (cases à
 * cocher du lien). Seules les sources cochées sont interrogées (US-MEDIA-001).
 */
export type ChatLinkSources = {
  connaissances: boolean;
  phototheque: boolean;
  lien: boolean;
};

/** Par défaut, un lien cherche dans toutes les sources (opt-out). */
export const DEFAULT_LINK_SOURCES: ChatLinkSources = {
  connaissances: true,
  phototheque: true,
  lien: true,
};

/** Normalise des sources brutes (booléens attendus) en s'appuyant sur les défauts. */
export function parseLinkSources(value: unknown): ChatLinkSources {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_LINK_SOURCES };
  }
  const record = value as Record<string, unknown>;
  const bool = (key: keyof ChatLinkSources): boolean =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : DEFAULT_LINK_SOURCES[key];
  return {
    connaissances: bool("connaissances"),
    phototheque: bool("phototheque"),
    lien: bool("lien"),
  };
}

export type ChatLink = {
  id: string;
  organizationId: string;
  label: string;
  type: ChatLinkType;
  /** Surface de diffusion : page publique ou widget intégrable (ADR-0040). */
  surface: ChatLinkSurface;
  /** Mode d'identification du visiteur (ADR-0033). */
  identificationMode: ActiveLinkIdentificationMode;
  prospectId: string | null;
  createdBy: string | null;
  actif: boolean;
  expiresAt: string | null;
  /** Modèle de raisonnement figé à la création (snapshot key+version). */
  templateKey: string;
  templateVersion: number;
  /** Sources recherchées à la génération (connaissances / photothèque / liens). */
  sources: ChatLinkSources;
  /** Politique de confidentialité rattachée (une seule, optionnelle). */
  confidentialiteId: string | null;
  /** Détecter l'état du visiteur (capacité cœur, ADR-0020). Défaut : false. */
  userStateEnabled: boolean;
  /** Template visuel rattaché (version figée) + tokens de thème (ADR-0019). */
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  visualTemplateConfig: Record<string, string>;
  /** Variables déclarées par le template, valorisées par l'exploitant (ADR-0023). */
  visualTemplateParams: TemplateParamValues;
  /** Configuration d'intégration widget (position), sans logique template. */
  widgetConfig: ChatLinkWidgetConfig;
  /** Canaux de diffusion (ADR-0041) ; optionnel pour les lignes/fixtures legacy. */
  channels?: ChatLinkChannels;
  /** Fournisseur IA explicite du lien (ADR-0029) ; null = hériter. */
  aiProviderId: string | null;
  /** Modèle IA explicite du lien ; null = hériter. */
  aiModel: string | null;
  /** Nombre d'ouvertures publiques comptées (hors robots connus). */
  visitCount: number;
  /** Dernière ouverture publique comptée ; null si aucune visite. */
  lastVisitAt: string | null;
  createdAt: string;
};

/** Vrai si le lien porte une affectation IA explicite (les deux champs requis). */
export function hasExplicitAiAssignment(link: Pick<ChatLink, "aiProviderId" | "aiModel">): boolean {
  return link.aiProviderId !== null && link.aiModel !== null;
}

/** Libellés distincts des liens d'une organisation, triés (filtres UI). */
export function distinctChatLinkLabels(links: readonly ChatLink[]): string[] {
  return [...new Set(links.map((link) => link.label))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Normalise la config widget d'un lien (position autorisée ou vide). */
export function parseWidgetConfig(value: unknown): ChatLinkWidgetConfig {
  return parseChatLinkWidgetConfig(value);
}

/** Normalise une config de thème (tokens string) provenant de la base. */
export function parseVisualTemplateConfig(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string") out[key] = val;
  }
  return out;
}

/** Normalise le sac de variables d'un lien (scalaires, borné, clés conservées). */
export function parseVisualTemplateParams(value: unknown): TemplateParamValues {
  return normalizeTemplateParamValues(value);
}

/**
 * Normalise le flag « détecter l'état du visiteur » (ADR-0020).
 * Booléen attendu ; toute autre valeur retombe sur `false` (dégradation sûre).
 */
export function parseUserStateEnabled(value: unknown): boolean {
  return value === true;
}

/** Statut de suivi d'une conversation (US-CONVERS-001). */
export const STATUTS_CONVERSATION = ["en_cours", "finalisee"] as const;

export type StatutConversation = (typeof STATUTS_CONVERSATION)[number];

export function isStatutConversation(value: string): value is StatutConversation {
  return (STATUTS_CONVERSATION as readonly string[]).includes(value);
}

/** Filtre serveur de la liste des conversations. */
export type ConversationFilter = "en_cours" | "finalisees" | "toutes" | "archivees";

export function parseConversationFilter(value: unknown): ConversationFilter {
  if (value === "finalisees" || value === "toutes" || value === "archivees") {
    return value;
  }
  return "en_cours";
}

export type Conversation = {
  id: string;
  organizationId: string;
  linkId: string;
  visitorNom: string;
  visitorEmail: string;
  visitorContacts: VisitorContact[];
  /** Prospect rattaché (renseigné dès l'identification). */
  prospectId: string | null;
  /** Statut de suivi (`en_cours` / `finalisee`). */
  statut: StatutConversation;
  /** Horodatage du dernier message (null si aucun message). */
  lastMessageAt: string | null;
  /** Consentement à la confidentialité (date) ; null si non requis/sans objet. */
  consentementAt: string | null;
  /** Politique acceptée (au moment du consentement). */
  confidentialiteId: string | null;
  /** Canal d'origine de la conversation (ADR-0041). */
  channel?: ChatLinkSurface;
  createdAt: string;
};

/** Moyen de contact complémentaire (lien standard : collecté par ContactGate). */
export const CONTACT_TYPES = ["téléphone", "whatsapp", "site web", "autre"] as const;

export type ContactType = (typeof CONTACT_TYPES)[number];

export type VisitorContact = {
  type: string;
  valeur: string;
};

export function isContactType(value: string): value is ContactType {
  return (CONTACT_TYPES as readonly string[]).includes(value);
}

export const CHAT_MESSAGE_ROLES = ["user", "assistant"] as const;

export type ChatMessageRole = (typeof CHAT_MESSAGE_ROLES)[number];

/** Média proposé par l'assistant, prêt à rendre (instantané). */
export type ChatMessageMedia = {
  id: string;
  type: "photo" | "lien";
  libelle: string;
  /** Photo : URL interne du fichier ; lien : URL externe. */
  url: string;
  /** Photo : type MIME ; lien : null. */
  mime: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  /** Médias proposés (photos/liens). Vide tant que non calculé. */
  medias: ChatMessageMedia[];
  /** Vrai si la recherche de médias a déjà été effectuée (idempotence). */
  mediasComputed: boolean;
  /** Pièces jointes du message (champs fichier, ADR-0034). */
  attachments: AttachmentView[];
  createdAt: string;
};
