import { describe, expect, it } from "vitest";
import {
  chatbotDraftSaveAction,
  defaultChatbotDraftState,
  hydrateChatbotDraftState,
  isChatbotDraftStateMeaningful,
  serializeChatbotDraftState,
} from "@/components/links/chatbot-draft-state";
import { collectTemporaryPhotoMediaIds } from "@/domain/entities/chatbot-draft";

describe("état de brouillon de chatbot", () => {
  it("considère le wizard vierge comme non significatif", () => {
    const state = defaultChatbotDraftState("conf-1");
    expect(state.channels.page.confidentialiteId).toBe("conf-1");
    expect(isChatbotDraftStateMeaningful(state)).toBe(false);
  });

  it("détecte un libellé, une sélection de données ou un ajout", () => {
    const labelled = defaultChatbotDraftState();
    labelled.label = "Campagne";
    expect(isChatbotDraftStateMeaningful(labelled)).toBe(true);

    const selected = defaultChatbotDraftState();
    selected.config.dataSelection = { mode: "selected", connaissanceIds: ["k1"], mediaIds: [] };
    expect(isChatbotDraftStateMeaningful(selected)).toBe(true);

    const withPhoto = defaultChatbotDraftState();
    withPhoto.dataDraft.photos = [
      { id: "p1", libelle: "Photo", description: "", mediaId: "media-1" },
    ];
    expect(isChatbotDraftStateMeaningful(withPhoto)).toBe(true);
  });

  it("sérialise puis recharge toutes les données du wizard", () => {
    const state = defaultChatbotDraftState("conf-1");
    state.step = 3;
    state.type = "standard";
    state.label = "Mon brouillon";
    state.config.behaviorMode = "expert";
    state.config.systemPrompt = "Prompt expert";
    state.config.dataSelection = {
      mode: "selected",
      connaissanceIds: ["k1", "k2"],
      mediaIds: ["m1"],
    };
    state.config.fiches = [
      {
        id: "f1",
        key: "fiche-projet",
        label: "Fiche projet",
        description: "desc",
        intent: "intent",
        instructions: "instructions",
        renderTemplate: "# {{contact}}",
        fields: [
          {
            id: "field-1",
            name: "contact",
            label: "Contact",
            type: "text",
            required: true,
            options: "",
            example: "",
          },
        ],
      },
    ];
    state.channels.widget.enabled = true;
    state.activeChannel = "widget";
    state.quota = {
      maxFiches: "10",
      maxTokens: "2000",
      tokenResetMode: "duration",
      tokenResetDays: "30",
    };
    state.dataBindings = { "row-1": "id-1" };
    state.ai = { aiProviderId: "provider-1", aiModel: "model-1" };
    state.dataDraft = {
      connaissances: [{ id: "c1", titre: "Titre", contenu: "Contenu" }],
      liens: [{ id: "l1", libelle: "Lien", url: "https://example.com", description: "d" }],
      photos: [{ id: "p1", libelle: "Photo", description: "pd", mediaId: "media-1" }],
    };

    const serialized = serializeChatbotDraftState(state);
    expect(JSON.stringify(serialized)).not.toContain('"fichier"');
    expect(serialized).toMatchObject({
      step: 3,
      type: "standard",
      label: "Mon brouillon",
      dataDraft: {
        connaissances: [{ id: "c1", titre: "Titre", contenu: "Contenu" }],
        liens: [
          {
            id: "l1",
            libelle: "Lien",
            url: "https://example.com",
            description: "d",
          },
        ],
        photos: [
          {
            id: "p1",
            libelle: "Photo",
            description: "pd",
            mediaId: "media-1",
          },
        ],
      },
    });

    const hydrated = hydrateChatbotDraftState(serialized, defaultChatbotDraftState());
    expect(hydrated.step).toBe(3);
    expect(hydrated.type).toBe("standard");
    expect(hydrated.label).toBe("Mon brouillon");
    expect(hydrated.config.behaviorMode).toBe("expert");
    expect(hydrated.config.systemPrompt).toBe("Prompt expert");
    expect(hydrated.config.dataSelection).toEqual({
      mode: "selected",
      connaissanceIds: ["k1", "k2"],
      mediaIds: ["m1"],
    });
    expect(hydrated.config.fiches).toHaveLength(1);
    expect(hydrated.config.fiches[0]?.fields[0]?.name).toBe("contact");
    expect(hydrated.channels.widget.enabled).toBe(true);
    expect(hydrated.activeChannel).toBe("widget");
    expect(hydrated.quota).toEqual({
      maxFiches: "10",
      maxTokens: "2000",
      tokenResetMode: "duration",
      tokenResetDays: "30",
    });
    expect(hydrated.dataBindings).toEqual({ "row-1": "id-1" });
    expect(hydrated.ai).toEqual({ aiProviderId: "provider-1", aiModel: "model-1" });
    expect(hydrated.dataDraft).toEqual(state.dataDraft);
  });

  it("tolère un état partiel ou invalide", () => {
    const fallback = defaultChatbotDraftState("conf-1");
    const hydrated = hydrateChatbotDraftState(
      {
        step: 99,
        type: "inconnu",
        channels: { page: { enabled: "oui" } },
        dataDraft: { photos: [{ libelle: "sans média" }] },
      },
      fallback,
    );
    expect(hydrated.step).toBe(5);
    expect(hydrated.type).toBe("specifique");
    expect(hydrated.channels.page.enabled).toBe(true);
    expect(hydrated.dataDraft.photos).toEqual([]);
  });

  it("décide create une seule fois puis update", () => {
    expect(
      chatbotDraftSaveAction({
        draftId: null,
        savedSignature: null,
        currentSignature: "a",
        meaningful: false,
      }),
    ).toBe("none");
    expect(
      chatbotDraftSaveAction({
        draftId: null,
        savedSignature: null,
        currentSignature: "a",
        meaningful: true,
      }),
    ).toBe("create");
    expect(
      chatbotDraftSaveAction({
        draftId: "d1",
        savedSignature: "a",
        currentSignature: "a",
        meaningful: true,
      }),
    ).toBe("none");
    expect(
      chatbotDraftSaveAction({
        draftId: "d1",
        savedSignature: "a",
        currentSignature: "b",
        meaningful: true,
      }),
    ).toBe("update");
  });

  it("extrait uniquement les photos temporaires référencées", () => {
    expect(
      collectTemporaryPhotoMediaIds({
        dataDraft: {
          photos: [
            { id: "p1", mediaId: "media-1" },
            { id: "p2", mediaId: "media-1" },
            { id: "p3" },
            { id: "p4", mediaId: "  " },
          ],
        },
      }),
    ).toEqual(["media-1"]);
    expect(collectTemporaryPhotoMediaIds(null)).toEqual([]);
    expect(collectTemporaryPhotoMediaIds({ dataDraft: { photos: "x" } })).toEqual([]);
  });
});
