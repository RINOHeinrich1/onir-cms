import type { ChatbotBuildBrief } from "@/domain/chatbot-builder";
import {
  BUILD_COLLECTION_GOAL_MAX,
  BUILD_DESCRIPTION_MAX,
  type ChatbotBuildSession,
  nextBuildQuestion,
  withBuildDerivedState,
} from "@/domain/chatbot-builder";
import { isChatbotMission } from "@/domain/entities/chatbot-information";

export type ChatbotBuildPatch = {
  description?: string;
  mission?: ChatbotBuildBrief["mission"];
  collectionGoal?: string;
  identity?: {
    label?: string;
    role?: string;
    objective?: string;
  };
  sources?: {
    websiteUrl?: string | null;
    useDescriptionAsSource?: boolean;
  };
  behavior?: {
    language?: ChatbotBuildBrief["behavior"]["language"];
    tone?: string;
    guardrails?: string[];
    extraInstructions?: string;
  };
};

export type ChatbotBuildTurn = {
  reply: string;
  suggestions: string[];
  patch: ChatbotBuildPatch;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
    : [];
}

function httpUrl(value: string): string | null {
  if (value === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseChatbotBuildTurn(input: unknown): ChatbotBuildTurn {
  const source = record(input);
  const rawPatch = record(source.patch);
  const rawIdentity = record(rawPatch.identity);
  const rawSources = record(rawPatch.sources);
  const rawBehavior = record(rawPatch.behavior);
  const rawLanguage = record(rawBehavior.language);
  const patch: ChatbotBuildPatch = {};

  const description = text(rawPatch.description);
  if (description !== "") patch.description = description.slice(0, BUILD_DESCRIPTION_MAX);
  if (isChatbotMission(rawPatch.mission)) patch.mission = rawPatch.mission;
  const collectionGoal = text(rawPatch.collectionGoal);
  if (collectionGoal !== "") {
    patch.collectionGoal = collectionGoal.slice(0, BUILD_COLLECTION_GOAL_MAX);
  }

  const identity: NonNullable<ChatbotBuildPatch["identity"]> = {};
  if (text(rawIdentity.label) !== "") identity.label = text(rawIdentity.label).slice(0, 120);
  if (text(rawIdentity.role) !== "") identity.role = text(rawIdentity.role).slice(0, 500);
  if (text(rawIdentity.objective) !== "") {
    identity.objective = text(rawIdentity.objective).slice(0, 1_000);
  }
  if (Object.keys(identity).length > 0) patch.identity = identity;

  const websiteUrl = text(rawSources.websiteUrl);
  const useDescriptionAsSource =
    typeof rawSources.useDescriptionAsSource === "boolean"
      ? rawSources.useDescriptionAsSource
      : undefined;
  if (useDescriptionAsSource !== undefined || websiteUrl !== "") {
    const parsed = websiteUrl === "" ? null : httpUrl(websiteUrl);
    if (parsed !== null || useDescriptionAsSource !== undefined) {
      patch.sources = {
        ...(parsed === null ? {} : { websiteUrl: parsed }),
        ...(useDescriptionAsSource === undefined ? {} : { useDescriptionAsSource }),
      };
    }
  }

  const behavior: NonNullable<ChatbotBuildPatch["behavior"]> = {};
  if (rawLanguage.mode === "auto") behavior.language = { mode: "auto" };
  else if (rawLanguage.mode === "fixed" && text(rawLanguage.value) !== "") {
    behavior.language = { mode: "fixed", value: text(rawLanguage.value).slice(0, 80) };
  }
  if (text(rawBehavior.tone) !== "") behavior.tone = text(rawBehavior.tone).slice(0, 200);
  const guardrails = strings(rawBehavior.guardrails).filter((entry) => entry !== "");
  if (guardrails.length > 0) behavior.guardrails = guardrails.slice(0, 20);
  if (text(rawBehavior.extraInstructions) !== "") {
    behavior.extraInstructions = text(rawBehavior.extraInstructions).slice(0, 4_000);
  }
  if (Object.keys(behavior).length > 0) patch.behavior = behavior;

  return {
    reply: text(source.reply).slice(0, 2_000),
    suggestions: strings(source.suggestions)
      .filter((entry) => entry !== "")
      .slice(0, 5)
      .map((entry) => entry.slice(0, 160)),
    patch,
  };
}

export function applyBuildPatch(
  session: ChatbotBuildSession,
  turn: ChatbotBuildTurn,
): ChatbotBuildSession {
  const { patch } = turn;
  const brief: ChatbotBuildBrief = {
    ...session.brief,
    description: patch.description ?? session.brief.description,
    mission: patch.mission ?? session.brief.mission,
    collectionGoal: patch.collectionGoal ?? session.brief.collectionGoal,
    identity: {
      ...session.brief.identity,
      ...(patch.identity?.label === undefined ? {} : { label: patch.identity.label }),
      ...(patch.identity?.role === undefined ? {} : { role: patch.identity.role }),
      ...(patch.identity?.objective === undefined ? {} : { objective: patch.identity.objective }),
    },
    sources: {
      ...session.brief.sources,
      ...(patch.sources?.websiteUrl === undefined ? {} : { websiteUrl: patch.sources.websiteUrl }),
      intent: {
        ...session.brief.sources.intent,
        connaissances:
          session.brief.sources.intent.connaissances ||
          (patch.sources?.websiteUrl ?? session.brief.sources.websiteUrl) !== null ||
          (patch.sources?.useDescriptionAsSource ?? session.brief.sources.useDescriptionAsSource),
      },
    },
    behavior: {
      ...session.brief.behavior,
      ...(patch.behavior?.language === undefined ? {} : { language: patch.behavior.language }),
      ...(patch.behavior?.tone === undefined ? {} : { tone: patch.behavior.tone }),
      ...(patch.behavior?.guardrails === undefined
        ? {}
        : { guardrails: patch.behavior.guardrails }),
      ...(patch.behavior?.extraInstructions === undefined
        ? {}
        : { extraInstructions: patch.behavior.extraInstructions }),
    },
  };

  const next = withBuildDerivedState({ ...session, brief });
  const reply =
    turn.reply === ""
      ? next.missingMandatory.length === 0
        ? "J'ai toutes les informations nécessaires. Vous pouvez générer le chatbot."
        : nextBuildQuestion(next.missingMandatory[0] ?? "description")
      : turn.reply;

  return {
    ...next,
    messages: [...session.messages, { role: "assistant" as const, content: reply }].slice(-60),
    suggestions: turn.suggestions,
    version: session.version + 1,
  };
}
