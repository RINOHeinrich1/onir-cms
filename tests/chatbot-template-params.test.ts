import { describe, expect, it, vi } from "vitest";
import type { AiClient, AiCompletionInput } from "@/application/ports/ai-client";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { generateChatbotTemplateParams } from "@/application/use-cases/chatbots/generate-chatbot-template-params";
import { EMPTY_SITE_PALETTE } from "@/domain/site-palette";

const ACTOR = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function templateRepository(): VisualTemplateRepository {
  return {
    findAssignedById: async () => ({
      id: "tpl-1",
      key: "starter",
      name: "Starter",
      description: "",
      author: "ONIR",
      createdBy: null,
      createdAt: "",
      updatedAt: "",
    }),
    findVersion: async () => ({
      id: "v-1",
      templateId: "tpl-1",
      version: "1.0.0",
      hostProtocol: "onirtech.template-host.v1",
      trustLevel: "official",
      mode: "iframe",
      entry: "index.html",
      integrity: "sha256-x",
      createdAt: "",
      manifest: {
        schemaVersion: 1,
        kind: "template",
        name: "Starter",
        version: "1.0.0",
        author: "ONIR",
        description: "",
        entry: "index.html",
        mode: "iframe",
        hostProtocol: "onirtech.template-host.v1",
        trustLevel: "official",
        capabilities: [],
        params: [
          {
            key: "title",
            label: "Titre du chatbot",
            description: "",
            type: "string",
            default: "Défaut",
            maxLength: 80,
          },
          {
            key: "primary_color",
            label: "Couleur principale",
            description: "",
            type: "color",
            default: "#000000",
          },
          {
            key: "style",
            label: "Style",
            description: "",
            type: "select",
            default: "a",
            options: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
          {
            key: "link",
            label: "Lien",
            description: "",
            type: "url",
            default: "https://example.com",
          },
        ],
        dataContracts: [],
      },
    }),
  } as unknown as VisualTemplateRepository;
}

function aiFactory(complete: (input: AiCompletionInput) => Promise<string>): AiClientFactory {
  const client: AiClient = { complete };
  const target: ResolvedAiTarget = {
    organizationId: "org-1",
    providerId: "provider-1",
    providerLabel: "Test",
    model: "model-1",
    source: "organization",
  };
  return {
    resolve: async () => target,
    forTarget: async () => client,
    optionalTarget: async () => client,
  };
}

describe("paramètres statiques du template", () => {
  it("remplit les clés connues, ignore url/inconnues et retombe sur les défauts", async () => {
    const complete = vi.fn<(input: AiCompletionInput) => Promise<string>>(async () =>
      JSON.stringify({
        params: {
          title: "Titre IA",
          primary_color: "#ffffff",
          style: "b",
          link: "https://evil.example",
          unknown: "ignoré",
        },
      }),
    );
    const result = await generateChatbotTemplateParams(
      { aiFactory: aiFactory(complete), visualTemplates: templateRepository() },
      ACTOR,
      {
        templateId: "tpl-1",
        templateVersion: "1.0.0",
        chatbot: {
          label: "Atelier",
          description: "Un assistant pour l’atelier.",
          role: "assistant",
          objective: "Aider",
          tone: "chaleureux",
          extraInstructions: "",
        },
        knowledge: [],
        palette: EMPTY_SITE_PALETTE,
      },
    );

    expect(result.params).toEqual({
      title: "Titre IA",
      primary_color: "#ffffff",
      style: "b",
      link: "https://example.com",
    });
    expect(complete.mock.calls[0]?.[0].structured).toBe(true);
  });

  it("génère uniquement les couleurs à partir de la conversation", async () => {
    const complete = vi.fn<(input: AiCompletionInput) => Promise<string>>(async () =>
      JSON.stringify({
        params: {
          title: "Titre interdit",
          primary_color: "#123456",
        },
      }),
    );
    const result = await generateChatbotTemplateParams(
      { aiFactory: aiFactory(complete), visualTemplates: templateRepository() },
      ACTOR,
      {
        templateId: "tpl-1",
        templateVersion: "1.0.0",
        chatbot: {
          label: "Atelier",
          description: "",
          role: "assistant",
          objective: "Aider",
          tone: "chaleureux",
          extraInstructions: "",
        },
        knowledge: [],
        conversation: [
          { role: "user", content: "Je voudrais un thème vert profond et chaleureux." },
        ],
        palette: EMPTY_SITE_PALETTE,
        types: ["color"],
      },
    );

    expect(result.params).toEqual({
      title: "Défaut",
      primary_color: "#123456",
      style: "a",
      link: "https://example.com",
    });
    const prompt = complete.mock.calls[0]?.[0];
    expect(prompt?.messages[0]?.content).toContain("thème vert profond");
    expect(prompt?.messages[0]?.content).not.toContain("description du site");
  });
});
