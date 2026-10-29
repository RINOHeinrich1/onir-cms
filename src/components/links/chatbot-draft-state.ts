import { AI_LINK_USAGES, type AiLinkTarget, type AiLinkUsage } from "@/domain/entities/ai-usage";
import type { ChatLinkSources, ChatLinkSurface, ChatLinkType } from "@/domain/entities/chat";
import { isChatLinkSurface, isChatLinkType, parseLinkSources } from "@/domain/entities/chat";
import { isWidgetPosition } from "@/domain/widget";
import type { LinkAiValue } from "./AiAssignmentField";
import {
  type ChatbotConfigDraft,
  defaultChatbotConfigDraft,
  draftFromConfig,
} from "./chatbot-config-draft";
import {
  type ChatbotDataDraft,
  hydrateChatbotDataDraft,
  serializeChatbotDataDraft,
} from "./chatbot-data-draft";
import type { ChannelDraft, ChannelDrafts } from "./LinkChannelsFields";
import type { LinkQuotaDraft } from "./LinkQuotaFields";

/** État complet (et sérialisable) du wizard de création de chatbot. */
export type ChatbotDraftState = {
  step: number;
  type: ChatLinkType;
  prospectId: string;
  label: string;
  expiresAt: string;
  config: ChatbotConfigDraft;
  channels: ChannelDrafts;
  activeChannel: ChatLinkSurface;
  sources: ChatLinkSources;
  userStateEnabled: boolean;
  quota: LinkQuotaDraft;
  dataBindings: Record<string, string>;
  ai: LinkAiValue;
  aiUsage: Partial<Record<AiLinkUsage, AiLinkTarget>>;
  dataDraft: ChatbotDataDraft;
};

const STEP_MIN = 0;
const STEP_MAX = 5;

/** État initial du wizard (aucune donnée utilisateur). */
export function defaultChatbotDraftState(defaultConfidentialiteId = ""): ChatbotDraftState {
  return {
    step: 0,
    type: "specifique",
    prospectId: "",
    label: "",
    expiresAt: "",
    config: defaultChatbotConfigDraft(),
    channels: {
      page: {
        enabled: true,
        identificationMode: "contact",
        confidentialiteId: defaultConfidentialiteId,
        visualTemplate: "",
        params: {},
        widgetPosition: "bottom-right",
      },
      widget: {
        enabled: false,
        identificationMode: "anonymous",
        confidentialiteId: "",
        visualTemplate: "",
        params: {},
        widgetPosition: "bottom-right",
      },
    },
    activeChannel: "page",
    sources: { connaissances: true, phototheque: true, lien: true },
    userStateEnabled: false,
    quota: {
      maxFiches: "",
      maxTokens: "",
      tokenResetMode: "manual",
      tokenResetDays: "",
    },
    dataBindings: {},
    ai: { aiProviderId: null, aiModel: null },
    aiUsage: {},
    dataDraft: { connaissances: [], liens: [], photos: [] },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function params(value: unknown): Record<string, string | number | boolean> {
  const source = record(value);
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      result[key] = entry;
    }
  }
  return result;
}

function parseChannel(input: unknown, fallback: ChannelDraft): ChannelDraft {
  const source = record(input);
  const identificationMode =
    source.identificationMode === "anonymous" || source.identificationMode === "contact"
      ? source.identificationMode
      : fallback.identificationMode;
  const widgetPosition =
    typeof source.widgetPosition === "string" && isWidgetPosition(source.widgetPosition)
      ? source.widgetPosition
      : fallback.widgetPosition;
  return {
    enabled: bool(source.enabled, fallback.enabled),
    identificationMode,
    confidentialiteId: text(source.confidentialiteId) || fallback.confidentialiteId,
    visualTemplate: text(source.visualTemplate),
    params: params(source.params),
    widgetPosition,
  };
}

function parseQuota(input: unknown): LinkQuotaDraft {
  const source = record(input);
  return {
    maxFiches: text(source.maxFiches),
    maxTokens: text(source.maxTokens),
    tokenResetMode: source.tokenResetMode === "duration" ? "duration" : "manual",
    tokenResetDays: text(source.tokenResetDays),
  };
}

function parseAi(input: unknown): LinkAiValue {
  const source = record(input);
  return {
    aiProviderId: typeof source.aiProviderId === "string" ? source.aiProviderId : null,
    aiModel: typeof source.aiModel === "string" ? source.aiModel : null,
  };
}

function parseAiUsage(input: unknown): Partial<Record<AiLinkUsage, AiLinkTarget>> {
  const source = record(input);
  const result: Partial<Record<AiLinkUsage, AiLinkTarget>> = {};
  for (const usage of AI_LINK_USAGES) {
    const raw = record(source[usage]);
    if (raw.kind === "inherit") result[usage] = { kind: "inherit" };
    else if (raw.kind === "cluster" && typeof raw.clusterId === "string") {
      result[usage] = { kind: "cluster", clusterId: raw.clusterId };
    } else if (
      raw.kind === "model" &&
      typeof raw.providerId === "string" &&
      typeof raw.model === "string"
    ) {
      result[usage] = { kind: "model", providerId: raw.providerId, model: raw.model };
    }
  }
  return result;
}

function parseDataBindings(value: unknown): Record<string, string> {
  const source = record(value);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

/**
 * Recharge un état de brouillon (JSONB) dans le wizard, en tolérant les
 * champs absents ou legacy. `fallback` porte les valeurs par défaut du wizard
 * (notamment la politique de confidentialité par défaut des canaux).
 */
export function hydrateChatbotDraftState(
  input: unknown,
  fallback: ChatbotDraftState,
): ChatbotDraftState {
  const source = record(input);
  const channelsInput = record(source.channels);
  const step = typeof source.step === "number" ? Math.trunc(source.step) : fallback.step;
  const config = draftFromConfig(source.config) ?? fallback.config;
  const type =
    typeof source.type === "string" && isChatLinkType(source.type) ? source.type : fallback.type;
  const activeChannel =
    typeof source.activeChannel === "string" && isChatLinkSurface(source.activeChannel)
      ? source.activeChannel
      : fallback.activeChannel;
  return {
    step: Math.min(STEP_MAX, Math.max(STEP_MIN, step)),
    type,
    prospectId: text(source.prospectId),
    label: text(source.label),
    expiresAt: text(source.expiresAt),
    config,
    channels: {
      page: parseChannel(channelsInput.page, fallback.channels.page),
      widget: parseChannel(channelsInput.widget, fallback.channels.widget),
    },
    activeChannel,
    sources: parseLinkSources(source.sources ?? fallback.sources),
    userStateEnabled: bool(source.userStateEnabled, fallback.userStateEnabled),
    quota: parseQuota(source.quota),
    dataBindings: parseDataBindings(source.dataBindings),
    ai: parseAi(source.ai),
    aiUsage: parseAiUsage(source.aiUsage),
    dataDraft: hydrateChatbotDataDraft(source.dataDraft),
  };
}

/** Représentation JSONB : aucun `File`, aucun objet non sérialisable. */
export function serializeChatbotDraftState(state: ChatbotDraftState): Record<string, unknown> {
  return {
    step: state.step,
    type: state.type,
    prospectId: state.prospectId,
    label: state.label,
    expiresAt: state.expiresAt,
    config: state.config,
    channels: state.channels,
    activeChannel: state.activeChannel,
    sources: state.sources,
    userStateEnabled: state.userStateEnabled,
    quota: state.quota,
    dataBindings: state.dataBindings,
    ai: state.ai,
    aiUsage: state.aiUsage,
    dataDraft: serializeChatbotDataDraft(state.dataDraft),
  };
}

export function chatbotDraftStateSignature(state: ChatbotDraftState): string {
  return JSON.stringify(serializeChatbotDraftState(state));
}

function configComparable(config: ChatbotConfigDraft): string {
  return JSON.stringify({
    behaviorMode: config.behaviorMode,
    systemPrompt: config.systemPrompt,
    simple: config.simple,
    fiches: config.fiches.map((fiche) => ({
      key: fiche.key,
      label: fiche.label,
      description: fiche.description,
      intent: fiche.intent,
      instructions: fiche.instructions,
      renderTemplate: fiche.renderTemplate,
      sourceFicheId: fiche.sourceFicheId ?? null,
      sourceVersion: fiche.sourceVersion ?? null,
      fields: fiche.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        example: field.example,
        requiredIf: field.requiredIf ?? null,
        file: field.file ?? null,
      })),
    })),
    dataSelection: config.dataSelection,
  });
}

/**
 * Un état est « significatif » dès qu'il contient autre chose que le wizard
 * vierge. On évite ainsi de créer un brouillon vide à l'ouverture.
 */
export function isChatbotDraftStateMeaningful(state: ChatbotDraftState): boolean {
  if (state.step > 0) return true;
  if (state.type !== "specifique") return true;
  if (
    state.label.trim() !== "" ||
    state.prospectId.trim() !== "" ||
    state.expiresAt.trim() !== ""
  ) {
    return true;
  }
  if (configComparable(state.config) !== configComparable(defaultChatbotConfigDraft())) return true;
  if (state.channels.widget.enabled || !state.channels.page.enabled) return true;
  if (state.activeChannel !== "page") return true;
  if (
    state.sources.connaissances !== true ||
    state.sources.phototheque !== true ||
    state.sources.lien !== true
  ) {
    return true;
  }
  if (state.userStateEnabled) return true;
  if (
    state.quota.maxFiches !== "" ||
    state.quota.maxTokens !== "" ||
    state.quota.tokenResetMode !== "manual" ||
    state.quota.tokenResetDays !== ""
  ) {
    return true;
  }
  if (Object.keys(state.dataBindings).length > 0) return true;
  if (state.ai.aiProviderId !== null || state.ai.aiModel !== null) return true;
  if (Object.keys(state.aiUsage).length > 0) return true;
  if (
    state.dataDraft.connaissances.length > 0 ||
    state.dataDraft.liens.length > 0 ||
    state.dataDraft.photos.length > 0
  ) {
    return true;
  }
  if (
    state.config.dataSelection.mode !== "all" ||
    state.config.dataSelection.connaissanceIds.length > 0 ||
    state.config.dataSelection.mediaIds.length > 0
  ) {
    return true;
  }
  return false;
}

export type ChatbotDraftSaveAction = "none" | "create" | "update";

/**
 * Décision d'autosave : ne rien faire si l'état est vierge ou inchangé,
 * créer une seule fois, puis mettre à jour le même brouillon.
 */
export function chatbotDraftSaveAction(input: {
  draftId: string | null;
  savedSignature: string | null;
  currentSignature: string;
  meaningful: boolean;
}): ChatbotDraftSaveAction {
  if (!input.meaningful) return "none";
  if (input.currentSignature === input.savedSignature) return "none";
  return input.draftId === null ? "create" : "update";
}
