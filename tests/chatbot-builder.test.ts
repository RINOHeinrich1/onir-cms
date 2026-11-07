import { describe, expect, it } from "vitest";
import {
  applyBuildPatch,
  parseChatbotBuildTurn,
} from "@/application/use-cases/chatbot-builder/parse-build-turn";
import {
  chatbotConfigDraftFromAi,
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
} from "@/components/links/chatbot-config-draft";
import type { ChatbotAiDraft } from "@/domain/chatbot-ai-draft";
import {
  briefMessages,
  briefSourceText,
  buildSessionFromState,
  effectiveSourceIntent,
  emptyBuildBrief,
  emptyBuildSession,
  isBuilderDraftState,
  missingBuildRequirements,
  normalizeBuildBrief,
  serializeBuildSession,
  withBuildDerivedState,
} from "@/domain/chatbot-builder";
import { defaultChatbotFallback } from "@/domain/entities/chatbot-config";
import { EMPTY_SITE_PALETTE } from "@/domain/site-palette";

function brief(overrides: Parameters<typeof normalizeBuildBrief>[0]) {
  return normalizeBuildBrief(overrides);
}

describe("chatbot builder — prérequis", () => {
  it("inform utilise le texte par défaut quand aucune source externe n’est fournie", () => {
    const withoutSource = brief({
      ...emptyBuildBrief(),
      description: "Informer les clients",
      mission: "inform",
      collectionGoal: "Nom",
    });
    expect(missingBuildRequirements(withoutSource)).toEqual([]);
    expect(withoutSource.sources.useDescriptionAsSource).toBe(true);
    expect(withoutSource.collectionGoal).toBeNull();

    const withSource = brief({
      ...withoutSource,
      sources: {
        ...withoutSource.sources,
        websiteUrl: "https://exemple.test",
        intent: { fiches: false, connaissances: true, medias: false },
      },
    });
    expect(missingBuildRequirements(withSource)).toEqual([]);
  });

  it("accepte le texte fourni comme source de connaissances", () => {
    const withTextSource = brief({
      ...emptyBuildBrief(),
      description:
        "A2DM Formation propose des formations en bureautique, développement web et infographie. Téléphone : +261 34 23 236 92.",
      mission: "inform",
      sources: {
        ...emptyBuildBrief().sources,
        useDescriptionAsSource: true,
      },
    });
    expect(missingBuildRequirements(withTextSource)).toEqual([]);
    expect(effectiveSourceIntent(withTextSource).connaissances).toBe(true);
  });

  it("collect exige un objectif de collecte et ignore les sources actives", () => {
    const collect = brief({
      ...emptyBuildBrief(),
      description: "Collecter des prospects",
      mission: "collect",
      sources: {
        ...emptyBuildBrief().sources,
        websiteUrl: "https://exemple.test",
        intent: { fiches: true, connaissances: true, medias: true },
      },
    });
    expect(missingBuildRequirements(collect)).toEqual(["collection_goal"]);
    expect(collect.sources.intent).toEqual({
      fiches: false,
      connaissances: false,
      medias: false,
    });
  });

  it("hybrid exige un objectif de collecte et utilise le texte par défaut", () => {
    const hybrid = brief({
      ...emptyBuildBrief(),
      description: "Informer et collecter",
      mission: "hybrid",
    });
    expect(missingBuildRequirements(hybrid)).toEqual(["collection_goal"]);
    expect(hybrid.sources.useDescriptionAsSource).toBe(true);
  });
});

describe("chatbot builder — conversation", () => {
  it("applique un patch et ajoute la réponse assistant", () => {
    const session = {
      ...emptyBuildSession(),
      messages: [{ role: "user" as const, content: "Je veux informer mes clients." }],
    };
    const turn = parseChatbotBuildTurn({
      reply: "Sur quelles sources ?",
      suggestions: ["Mon site"],
      patch: {
        description: "Informer mes clients",
        mission: "inform",
        sources: { websiteUrl: "https://exemple.test" },
      },
    });
    const next = applyBuildPatch(session, turn);
    expect(next.brief.mission).toBe("inform");
    expect(next.brief.sources.websiteUrl).toBe("https://exemple.test/");
    expect(next.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Sur quelles sources ?",
    });
    expect(next.missingMandatory).toEqual([]);
  });

  it("reconnaît le texte fourni comme source", () => {
    const turn = parseChatbotBuildTurn({
      reply: "D’accord, le texte suffit.",
      patch: { sources: { useDescriptionAsSource: true } },
    });
    expect(turn.patch.sources?.useDescriptionAsSource).toBe(true);
  });

  it("ignore une URL invalide et une mission inconnue", () => {
    const turn = parseChatbotBuildTurn({
      reply: "D’accord.",
      patch: { mission: "autre", sources: { websiteUrl: "ftp://invalid" } },
    });
    expect(turn.patch.mission).toBeUndefined();
    expect(turn.patch.sources).toBeUndefined();
  });
});

describe("chatbot builder — messages du brief", () => {
  it("transmet uniquement les messages utilisateur, dans l’ordre", () => {
    const session = {
      ...emptyBuildSession(),
      messages: [
        { role: "assistant" as const, content: "Question" },
        { role: "user" as const, content: "Premier contenu" },
        { role: "assistant" as const, content: "Réponse" },
        { role: "user" as const, content: "Deuxième contenu" },
      ],
    };
    expect(briefMessages(session)).toEqual(["Premier contenu", "Deuxième contenu"]);
    expect(briefSourceText(session)).toBe("Premier contenu\n\nDeuxième contenu");
  });

  it("tronque le texte source à la limite prévue", () => {
    const session = {
      ...emptyBuildSession(),
      messages: [{ role: "user" as const, content: "x".repeat(30_000) }],
    };
    expect(briefSourceText(session)).toHaveLength(24_000);
  });
});

describe("chatbot builder — persistance", () => {
  it("sérialise et recharge une session, puis la cache des brouillons standards", () => {
    const session = withBuildDerivedState({
      ...emptyBuildSession(),
      brief: brief({
        ...emptyBuildBrief(),
        description: "Informer",
        mission: "inform",
        sources: {
          ...emptyBuildBrief().sources,
          websiteUrl: "https://exemple.test",
          intent: { fiches: false, connaissances: true, medias: false },
        },
      }),
    });
    const state = serializeBuildSession(session);
    expect(isBuilderDraftState(state)).toBe(true);
    const loaded = buildSessionFromState(state, "draft-1");
    expect(loaded?.id).toBe("draft-1");
    expect(loaded?.brief.mission).toBe("inform");
    expect(loaded?.status).toBe("ready");
  });
});

describe("chatbot builder — sélection média indépendante", () => {
  it("ne mélange pas la sélection connaissances et médias dans le payload", () => {
    const config = defaultChatbotConfigDraft();
    config.dataSelection = {
      mode: "selected",
      connaissanceIds: ["connaissance-1"],
      mediaIds: [],
    };
    config.mediaSelection = { mode: "all", connaissanceIds: [], mediaIds: [] };
    const payload = chatbotConfigPayload(config, {
      sources: { connaissances: true, phototheque: true, lien: true },
    }) as {
      informationSources: {
        connaissances: { selection: { mode: string; ids: string[] } };
        medias: { selection: { mode: string; ids: string[] } };
      };
    };
    expect(payload.informationSources.connaissances.selection).toEqual({
      mode: "selected",
      ids: ["connaissance-1"],
    });
    expect(payload.informationSources.medias.selection).toEqual({ mode: "all", ids: [] });
  });
});

describe("chatbot builder — mapping", () => {
  it("force une sélection de connaissances sûre et respecte inform", () => {
    const draft: ChatbotAiDraft = {
      label: "Support",
      description: "Répond aux questions",
      role: "assistant support",
      objective: "",
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
      fields: [],
      systemPrompt: "",
      renderTemplate: "",
      knowledge: [{ titre: "Horaires", contenu: "9h–18h" }],
      fallback: defaultChatbotFallback(),
      warnings: [],
      settings: {
        role: "assistant support",
        objective: "",
        language: { mode: "auto" },
        tone: "",
        guardrails: [],
        extraInstructions: "",
      },
    };
    const config = chatbotConfigDraftFromAi(draft, { mission: "inform" });
    expect(config.mission).toBe("inform");
    expect(config.fiches).toEqual([]);
    expect(config.dataSelection.mode).toBe("selected");
    expect(config.mediaSelection).toEqual({
      mode: "selected",
      connaissanceIds: [],
      mediaIds: [],
    });
  });
});

describe("chatbot builder — règles de mission à la génération", () => {
  const base = {
    generationId: "generation-1",
    key: "support",
    draft: {
      label: "Support",
      description: "Support",
      role: "assistant support",
      objective: "",
      language: { mode: "auto" as const },
      tone: "",
      guardrails: [],
      extraInstructions: "",
      fields: [{ name: "nom", label: "Nom", type: "text" as const, required: true }],
      systemPrompt: "",
      renderTemplate: "",
      knowledge: [{ titre: "Horaires", contenu: "9h–18h" }],
      fallback: { ...defaultChatbotFallback(), showCollectionForm: false },
      warnings: [],
      settings: {
        role: "assistant support",
        objective: "",
        language: { mode: "auto" as const },
        tone: "",
        guardrails: [],
        extraInstructions: "",
      },
    },
    sources: { pages: [], files: [], chars: 0, truncated: false },
    warnings: [],
    existingAiKnowledgeCount: 0,
    providerLabel: "Test",
    providerId: null,
    model: "test",
    sitePalette: EMPTY_SITE_PALETTE,
  };

  it("inform supprime les champs et conserve les connaissances", async () => {
    const { postProcessDraft } = await import(
      "@/application/use-cases/chatbot-builder/manage-chatbot-builder"
    );
    const result = postProcessDraft(base, "inform");
    expect(result.draft.fields).toEqual([]);
    expect(result.draft.knowledge).toHaveLength(1);
    expect(result.draft.fallback.showCollectionForm).toBe(false);
    expect(result.sourceIntent.connaissances).toBe(true);
  });

  it("collect supprime les connaissances et conserve la fiche", async () => {
    const { postProcessDraft } = await import(
      "@/application/use-cases/chatbot-builder/manage-chatbot-builder"
    );
    const result = postProcessDraft(base, "collect");
    expect(result.draft.fields).toHaveLength(1);
    expect(result.draft.knowledge).toEqual([]);
    expect(result.draft.fallback.showCollectionForm).toBe(true);
    expect(result.sourceIntent).toEqual({
      fiches: false,
      connaissances: false,
      medias: false,
    });
  });
});
