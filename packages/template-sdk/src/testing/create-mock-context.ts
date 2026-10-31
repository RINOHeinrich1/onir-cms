/**
 * `createMockContext` — contexte hôte complet pour les tests unitaires
 * (ADR-0024 §8.1, §10).
 *
 * Aucune dépendance runtime : `happy-dom` / `jsdom` restent des devDependencies
 * du projet de test, ce module n'en importe aucun.
 */
import { CONTRACT_VERSION, TEMPLATE_HOST_PROTOCOL } from "../constants.js";
import type {
  OnirtechContext,
  TemplateActions,
  TemplateCapability,
  TemplateDataApi,
  TemplateKnowledgeRef,
  TemplateMessage,
  TemplateMessageMedia,
  TemplateParamValues,
  TemplateUserState,
} from "../types.js";

/**
 * Surcharge partielle et récursive d'un type de contexte.
 *
 * - objets : chaque champ est optionnel et récursivement partiel ;
 * - tableaux : le tableau est **remplacé** (pas de fusion index par index),
 *   chaque élément pouvant être partiel ;
 * - fonctions et scalaires : remplacés tels quels.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/** Date fixe des messages générés (déterminisme des assertions). */
const DEFAULT_MESSAGE_AT = "2026-01-01T00:00:00.000Z";

/** Capacités déclarées par le mock (toutes celles du contrat). */
const MOCK_CAPABILITIES: TemplateCapability[] = [
  "messages",
  "media",
  "modelForm",
  "theme",
  "userState",
  "knowledge",
  "attachments",
  "fallback",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Fusion profonde d'une surcharge dans une base.
 * Les tableaux sont **remplacés** ; les valeurs `undefined` sont ignorées.
 */
function mergeValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (Array.isArray(override)) return override;
  if (isRecord(base) && isRecord(override)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (value === undefined) continue;
      merged[key] = key in merged ? mergeValue(merged[key], value) : value;
    }
    return merged;
  }
  return override;
}

function isUserStateLabel(value: unknown): value is TemplateUserState {
  return value === "neutral" || value === "content" || value === "triste";
}

function completeMedia(input: unknown): TemplateMessageMedia {
  const media = isRecord(input) ? input : {};
  return {
    type: media.type === "photo" ? "photo" : "lien",
    libelle: typeof media.libelle === "string" ? media.libelle : "",
    url: typeof media.url === "string" ? media.url : "",
  };
}

function completeKnowledgeRef(input: unknown): TemplateKnowledgeRef {
  const ref = isRecord(input) ? input : {};
  return {
    ref: typeof ref.ref === "string" ? ref.ref : "",
    titre: typeof ref.titre === "string" ? ref.titre : "",
  };
}

/**
 * Complète un message partiel avec les champs obligatoires du contrat
 * (`id`, `role`, `content`, `medias`, `at`) — ADR-0024 §8.1, §10.
 */
function completeMessage(input: unknown, index: number): TemplateMessage {
  const source = isRecord(input) ? input : {};
  const medias = Array.isArray(source.medias) ? source.medias.map(completeMedia) : [];
  const message: TemplateMessage = {
    id: typeof source.id === "string" ? source.id : `mock-message-${index + 1}`,
    role: source.role === "user" ? "user" : "assistant",
    content: typeof source.content === "string" ? source.content : "",
    medias,
    at: typeof source.at === "string" ? source.at : DEFAULT_MESSAGE_AT,
    ...(typeof source.authorName === "string" && source.authorName.trim() !== ""
      ? { authorName: source.authorName }
      : {}),
  };
  const userState = source.userState;
  if (isRecord(userState)) {
    message.userState = {
      label: isUserStateLabel(userState.label) ? userState.label : "neutral",
      confidence: typeof userState.confidence === "number" ? userState.confidence : 1,
    };
  }
  const knowledge = source.knowledge;
  if (Array.isArray(knowledge)) {
    message.knowledge = knowledge.map(completeKnowledgeRef);
  }
  return message;
}

/** Actions no-op (le template testé n'atteint jamais l'hôte). */
function defaultActions(): TemplateActions {
  return {
    submitIdentity: () => undefined,
    sendMessage: () => undefined,
    attachFile: () => Promise.resolve(),
    removeAttachment: () => Promise.resolve(),
    finish: () => undefined,
    selectFallback: () => undefined,
    openCollectionForm: () => undefined,
    submitCollection: async () => undefined,
    request: () => Promise.resolve(undefined),
    openMedia: () => undefined,
    resize: () => undefined,
    openWidget: () => undefined,
    closeWidget: () => undefined,
  };
}

/** Chargement de données de test : aucune fixture par défaut (DATA_UNBOUND). */
function defaultData(): TemplateDataApi {
  return {
    load: () =>
      Promise.resolve({
        status: "error" as const,
        code: "DATA_UNBOUND" as const,
        message: "Aucune donnée de test fournie",
      }),
  };
}

/** Contexte par défaut, complet et conforme au contrat hôte. */
function defaultContext(): OnirtechContext {
  return {
    host: { protocol: TEMPLATE_HOST_PROTOCOL, version: CONTRACT_VERSION },
    surface: "page",
    link: { type: "standard", label: "Lien standard", userStateEnabled: false },
    locale: "fr",
    brand: { name: "ONIRTECH", logoUrl: null },
    theme: { text: "#0f172a", background: "#ffffff" },
    capabilities: [...MOCK_CAPABILITIES],
    params: Object.freeze<TemplateParamValues>({}),
    consent: {
      texte: "Politique de confidentialité de démonstration",
      lien: "https://example.com/confidentialite",
    },
    state: { phase: "identity", status: "en_cours", messages: [], typing: false },
    resources: { media: { photos: [], liens: [] }, modelForm: null },
    actions: defaultActions(),
    data: defaultData(),
    on: () => () => undefined,
  };
}

/**
 * Crée un contexte **complet et conforme** au contrat hôte, avec surcharges
 * profondes partielles (ADR-0024 §8.1).
 *
 * - `params` est toujours **gelé** (§10.3) ;
 * - un tableau surchargé **remplace** le tableau par défaut ;
 * - chaque message surchargé est complété (`id`, `role`, `content`, `medias`, `at`).
 */
export function createMockContext(overrides: DeepPartial<OnirtechContext> = {}): OnirtechContext {
  const merged = mergeValue(defaultContext(), overrides) as OnirtechContext;
  const messages = Array.isArray(merged.state.messages) ? merged.state.messages : [];
  return {
    ...merged,
    params: Object.freeze<TemplateParamValues>({ ...merged.params }),
    state: { ...merged.state, messages: messages.map(completeMessage) },
  };
}
