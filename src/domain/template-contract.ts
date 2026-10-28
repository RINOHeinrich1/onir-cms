import type { TemplateDataContract } from "@/domain/data-contracts";
import type { ConnaissanceRef } from "@/domain/entities/connaissance";
import type { UserState } from "@/domain/entities/user-state";
import { TEMPLATE_HOST_PROTOCOL, type TemplateCapability } from "@/domain/entities/visual-template";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";

/**
 * Contrat hôte des templates visuels (version logique, transport-agnostique).
 * Ces types sont NORMATIFS : identiques pour le transport Web Component (contexte
 * injecté) et le transport iframe (`postMessage`). Les templates développés par
 * des tiers s'appuient dessus.
 */

export const TEMPLATE_CONTRACT_VERSION = 1;

/** Spécification runtime d'un template chargé par l'hôte. */
export type TemplateSpec = {
  id: string;
  versionId: string;
  version: string;
  mode: "web-component" | "iframe";
  entryUrl: string;
  element: string | null;
  capabilities: TemplateCapability[];
  /** Schéma des variables déclarées par la version (ADR-0023). */
  params: TemplateParamSchema[];
  /** Contrats de données déclarés par la version (ADR-0026). */
  dataContracts: TemplateDataContract[];
};

export type TemplateMessageMedia = {
  type: "photo" | "lien";
  libelle: string;
  url: string;
};

/** Pièce jointe exposée au template (ADR-0034). */
export type TemplateAttachment = {
  id: string;
  fieldName: string;
  fieldLabel: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
};

/** État du visiteur porté par un message utilisateur (capacité `userState`). */
export type TemplateMessageUserState = {
  label: UserState;
  confidence: number;
};

export type TemplateMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  medias: TemplateMessageMedia[];
  /** Pièces jointes du message (capacité `attachments`, ADR-0034). */
  attachments?: TemplateAttachment[];
  at: string;
  /**
   * Auteur humain d'un message opérateur (ADR-0043). Les messages opérateur
   * sont exposés avec `role: "assistant"` pour rester compatibles avec les
   * templates existants ; `authorName` permet aux templates récents de les
   * distinguer et de les signer.
   */
  authorName?: string;
  /**
   * État du visiteur déduit de ce message (ADR-0020, capacité `userState`,
   * message **utilisateur**). Absent si la capacité n'est pas déclarée OU si
   * le flag du lien est inactif.
   */
  userState?: TemplateMessageUserState;
  /**
   * Métadonnées (référence + titre) des connaissances réellement utilisées
   * (ADR-0020, capacité `knowledge`, message **assistant**). Absent si la
   * capacité n'est pas déclarée OU si la source connaissances est décochée.
   */
  knowledge?: ConnaissanceRef[];
};

export type TemplateMediaItem = { id: string; libelle: string; url: string };

export type TemplateFormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi" | "url" | "email" | "file";
  required: boolean;
  options?: string[];
  /** Champ `file` uniquement (ADR-0034). */
  accept?: string[];
  maxFiles?: number;
  maxBytes?: number;
};

/** Contexte envoyé au template (SANS les actions, qui sont injectées côté client). */
export type TemplateContextPayload = {
  host: { protocol: string; version: number };
  /** Surface de diffusion demandée par le lien (ADR-0040). */
  surface: "page" | "widget";
  link: { type: "standard" | "specifique"; label: string; userStateEnabled: boolean };
  locale: string;
  brand: { name: string; logoUrl: string | null };
  theme: Record<string, string>;
  capabilities: TemplateCapability[];
  /** Valeurs résolues (défauts ⊕ lien), objet gelé (ADR-0023). */
  params: TemplateParamValues;
  /** Politique de confidentialité rattachée au lien (null si aucune). */
  consent: { texte: string; lien: string } | null;
  state: {
    phase: "identity" | "chat";
    status: "en_cours" | "finalisee";
    messages: TemplateMessage[];
    typing: boolean;
    /** Pièces téléversées mais pas encore envoyées (capacité `attachments`). */
    pendingAttachments?: TemplateAttachment[];
  };
  resources: {
    media: { photos: TemplateMediaItem[]; liens: TemplateMediaItem[] };
    modelForm: TemplateFormField[] | null;
    /** Instantanés des contrats `eager` (ADR-0026) ; absent si aucun. */
    data?: Record<string, unknown>;
  };
};

export type TemplateIdentity = {
  nom: string;
  email: string;
  contacts?: { type: string; valeur: string }[];
  consentement?: boolean;
};

/** Action émise par le template vers l'hôte. */
export type TemplateAction =
  | { action: "ready" }
  | { action: "sendMessage"; payload: { content: string; attachmentIds?: string[] } }
  | {
      action: "attachFile";
      payload: { fieldName: string; name: string; mime: string; data: ArrayBuffer };
    }
  | { action: "removeAttachment"; payload: { attachmentId: string } }
  | { action: "submitIdentity"; payload: TemplateIdentity }
  | { action: "finish" }
  | { action: "request"; payload: { capability: TemplateCapability } }
  | { action: "openMedia"; payload: { url: string } }
  | { action: "resize"; payload: { height: number } }
  | { action: "openWidget"; payload: { width?: number; height?: number } }
  | { action: "closeWidget" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CONTENT = 4000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Valide une action entrante d'un template (défense en profondeur : l'hôte ne
 * fait JAMAIS confiance au message reçu). Rejette toute action non conforme.
 */
export function parseTemplateAction(
  input: unknown,
): { ok: true; value: TemplateAction } | { ok: false; error: string } {
  const src = record(input);
  const action = typeof src.action === "string" ? src.action : "";
  const payload = record(src.payload);

  switch (action) {
    case "ready":
    case "finish":
      return { ok: true, value: { action } };
    case "sendMessage": {
      const content = typeof payload.content === "string" ? payload.content.trim() : "";
      const attachmentIds = Array.isArray(payload.attachmentIds)
        ? payload.attachmentIds.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
          )
        : undefined;
      if (content === "" && (attachmentIds === undefined || attachmentIds.length === 0)) {
        return { ok: false, error: "content vide" };
      }
      if (content.length > MAX_CONTENT) return { ok: false, error: "content trop long" };
      return {
        ok: true,
        value: {
          action,
          payload: {
            content,
            ...(attachmentIds === undefined ? {} : { attachmentIds }),
          },
        },
      };
    }
    case "attachFile": {
      const fieldName = typeof payload.fieldName === "string" ? payload.fieldName.trim() : "";
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const mime = typeof payload.mime === "string" ? payload.mime.trim() : "";
      const data = payload.data;
      if (fieldName === "") return { ok: false, error: "fieldName requis" };
      if (name === "") return { ok: false, error: "nom de fichier requis" };
      if (mime === "") return { ok: false, error: "type MIME requis" };
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
        return { ok: false, error: "fichier invalide" };
      }
      if (data.byteLength > 10 * 1024 * 1024) {
        return { ok: false, error: "fichier trop volumineux" };
      }
      return { ok: true, value: { action, payload: { fieldName, name, mime, data } } };
    }
    case "removeAttachment": {
      const attachmentId =
        typeof payload.attachmentId === "string" ? payload.attachmentId.trim() : "";
      if (attachmentId === "") return { ok: false, error: "attachmentId requis" };
      return { ok: true, value: { action, payload: { attachmentId } } };
    }
    case "submitIdentity": {
      const nom = typeof payload.nom === "string" ? payload.nom.trim() : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (nom === "") return { ok: false, error: "nom requis" };
      if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "email invalide" };
      const contacts = Array.isArray(payload.contacts)
        ? (payload.contacts as TemplateIdentity["contacts"])
        : undefined;
      return {
        ok: true,
        value: {
          action,
          payload: {
            nom,
            email,
            ...(contacts === undefined ? {} : { contacts }),
            ...(typeof payload.consentement === "boolean"
              ? { consentement: payload.consentement }
              : {}),
          },
        },
      };
    }
    case "request": {
      const capability = typeof payload.capability === "string" ? payload.capability : "";
      return {
        ok: true,
        value: { action, payload: { capability: capability as TemplateCapability } },
      };
    }
    case "openMedia": {
      const url = typeof payload.url === "string" ? payload.url.trim() : "";
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { ok: false, error: "URL non http(s)" };
        }
      } catch {
        return { ok: false, error: "URL invalide" };
      }
      return { ok: true, value: { action, payload: { url } } };
    }
    case "resize": {
      const height = typeof payload.height === "number" ? payload.height : Number.NaN;
      if (!Number.isFinite(height) || height < 0 || height > 20000) {
        return { ok: false, error: "hauteur invalide" };
      }
      return { ok: true, value: { action, payload: { height } } };
    }
    case "openWidget": {
      const width = typeof payload.width === "number" ? payload.width : undefined;
      const height = typeof payload.height === "number" ? payload.height : undefined;
      if (width !== undefined && (!Number.isInteger(width) || width < 240 || width > 1200)) {
        return { ok: false, error: "largeur de widget invalide" };
      }
      if (height !== undefined && (!Number.isInteger(height) || height < 240 || height > 2000)) {
        return { ok: false, error: "hauteur de widget invalide" };
      }
      return {
        ok: true,
        value: {
          action,
          payload: {
            ...(width === undefined ? {} : { width }),
            ...(height === undefined ? {} : { height }),
          },
        },
      };
    }
    case "closeWidget":
      return { ok: true, value: { action } };
    default:
      return { ok: false, error: `action inconnue : ${action}` };
  }
}

export type BuildTemplateContextInput = {
  surface: "page" | "widget";
  link: { type: "standard" | "specifique"; label: string };
  locale: string;
  brand: { name: string; logoUrl: string | null };
  theme: Record<string, string>;
  capabilities: TemplateCapability[];
  /** Valeurs brutes du lien ; résolues contre le schéma par le constructeur. */
  params?: TemplateParamValues;
  consent: { texte: string; lien: string } | null;
  phase: "identity" | "chat";
  status: "en_cours" | "finalisee";
  messages: TemplateMessage[];
  typing: boolean;
  media: { photos: TemplateMediaItem[]; liens: TemplateMediaItem[] };
  modelForm: TemplateFormField[] | null;
  /** Pièces en attente (capacité `attachments`, ADR-0034). */
  pendingAttachments?: TemplateAttachment[];
  /** Flag lien : l'état du visiteur est activé (double garde, ADR-0020). */
  userStateEnabled?: boolean;
  /** Flag lien : la source connaissances est active (double garde, ADR-0020). */
  knowledgeEnabled?: boolean;
};

/**
 * Retire les champs optionnels `userState` / `knowledge` d'un message quand la
 * **double garde** n'est pas satisfaite (capacité déclarée ET flag lien actif).
 * Les champs non autorisés sont **absents** (pas `undefined`) : dégradation
 * gracieuse côté template.
 */
function sanitizeMessage(
  message: TemplateMessage,
  allowUserState: boolean,
  allowKnowledge: boolean,
  allowAttachments: boolean,
): TemplateMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    medias: message.medias,
    at: message.at,
    ...(allowUserState && message.userState !== undefined ? { userState: message.userState } : {}),
    ...(allowKnowledge && message.knowledge !== undefined ? { knowledge: message.knowledge } : {}),
    ...(allowAttachments && message.attachments !== undefined
      ? { attachments: message.attachments }
      : {}),
    ...(message.authorName !== undefined ? { authorName: message.authorName } : {}),
  };
}

/**
 * Construit le contexte (partie sérialisable) remis au template, en **filtrant
 * selon les capacités déclarées** : une ressource non déclarée n'est pas fournie.
 * Les capacités `userState` / `knowledge` (ADR-0020) sont soumises à une **double
 * garde** : capacité déclarée **ET** flag/option du lien actif.
 */
export function buildTemplateContext(input: BuildTemplateContextInput): TemplateContextPayload {
  const capabilities = new Set(input.capabilities);
  const allowUserState = capabilities.has("userState") && input.userStateEnabled === true;
  const allowKnowledge = capabilities.has("knowledge") && input.knowledgeEnabled === true;
  const allowAttachments = capabilities.has("attachments");
  return {
    host: { protocol: TEMPLATE_HOST_PROTOCOL, version: TEMPLATE_CONTRACT_VERSION },
    surface: input.surface,
    link: { ...input.link, userStateEnabled: input.userStateEnabled === true },
    locale: input.locale,
    brand: input.brand,
    theme: capabilities.has("theme") ? input.theme : {},
    params: Object.freeze({ ...input.params }),
    capabilities: input.capabilities,
    consent: input.consent,
    state: {
      phase: input.phase,
      status: input.status,
      messages: capabilities.has("messages")
        ? input.messages.map((message) =>
            sanitizeMessage(message, allowUserState, allowKnowledge, allowAttachments),
          )
        : [],
      typing: input.typing,
      ...(allowAttachments && input.pendingAttachments !== undefined
        ? { pendingAttachments: input.pendingAttachments }
        : {}),
    },
    resources: {
      media: capabilities.has("media") ? input.media : { photos: [], liens: [] },
      modelForm: capabilities.has("modelForm") ? input.modelForm : null,
    },
  };
}
