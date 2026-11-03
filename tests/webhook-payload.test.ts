import { beforeAll, describe, expect, it } from "vitest";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { buildWebhookRequest } from "@/application/use-cases/webhooks/build-webhook-request";
import type { FicheAttachment } from "@/domain/entities/attachment";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";
import type { WebhookEndpoint } from "@/domain/entities/webhook";

const DEFINITION: TemplateDefinition = {
  key: "lead-demo",
  label: "Lead démo",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "contact", label: "Contact", type: "text", required: true },
    { name: "budget", label: "Budget", type: "text", required: false },
    { name: "cin", label: "CIN", type: "file", required: false },
  ],
  renderTemplate: "# {{contact}}",
};

const FICHE: Fiche = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  conversationId: null,
  prospectId: "33333333-3333-4333-8333-333333333333",
  createdBy: null,
  definition: DEFINITION,
  data: { contact: "Rino", budget: "10k" },
  plateformes: [],
  description: "",
  budget: "10k",
  duree: "",
  contact: "Rino",
  statut: null,
  contraintesTechno: "",
  lienDocSpec: "",
  archivee: false,
  createdAt: "2026-10-26T10:00:00.000Z",
};

const PROSPECT = {
  id: "33333333-3333-4333-8333-333333333333",
  organizationId: FICHE.organizationId,
  nom: "Heinrich",
  prenom: "Rino",
  nature: "physique",
  email: "rino@example.com",
  activite: "",
  fonction: "",
  detail: "",
  origine: "saisie",
  lienId: null,
  lienLabel: null,
  contactMissing: false,
  createdBy: null,
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
} satisfies Prospect;

function endpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    organizationId: FICHE.organizationId,
    chatLinkId: null,
    ficheKey: null,
    name: "Partenaire",
    description: "",
    enabled: true,
    httpMethod: "POST",
    url: "https://partner.example.com/hooks/leads",
    queryParams: [{ name: "source", value: "onir", secret: false }],
    headers: [{ name: "X-Client", value: "onir-cms", secret: false }],
    bodyMode: "json",
    bodyTemplate: "",
    fieldMappings: [
      {
        source: "field",
        field: "contact",
        target: "contact",
        required: true,
        fileMode: "signed_url",
      },
      {
        source: "field",
        field: "budget",
        target: "budget",
        required: false,
        fileMode: "signed_url",
      },
      {
        source: "prospect",
        field: "email",
        target: "prospect.email",
        required: true,
        fileMode: "signed_url",
      },
      { source: "meta", field: "id", target: "fiche_id", required: true, fileMode: "signed_url" },
    ],
    auth: { type: "none" },
    timeoutMs: 10_000,
    maxAttempts: 3,
    retryBackoffMs: 30_000,
    followRedirects: false,
    tlsVerify: true,
    allowInsecureHttp: false,
    allowPrivateNetwork: false,
    createdBy: null,
    createdAt: "2026-10-26T10:00:00.000Z",
    updatedAt: "2026-10-26T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function dependencies(attachments: FicheAttachment[] = []) {
  return {
    prospects: {
      findById: async () => PROSPECT,
    } as unknown as ProspectRepository,
    attachments: {
      listByFiche: async () => attachments,
    } as unknown as AttachmentRepository,
    storage: {
      save: async () => "",
      read: async () => ({ data: Buffer.from("fichier"), contentType: "text/plain" }),
      remove: async () => undefined,
    } satisfies AttachmentStorage,
  };
}

describe("buildWebhookRequest", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-session-secret-webhook";
  });
  it("construit un JSON avec mapping, prospect, métadonnées et query", async () => {
    const built = await buildWebhookRequest(dependencies(), endpoint(), FICHE);
    const body = JSON.parse(built.request.body.toString("utf8")) as Record<string, unknown>;
    expect(body.contact).toBe("Rino");
    expect(body.budget).toBe("10k");
    expect(body.prospect).toEqual({ email: "rino@example.com" });
    expect(body.fiche_id).toBe(FICHE.id);
    expect(built.request.url).toContain("source=onir");
    expect(built.request.headers["X-Client"]).toBe("onir-cms");
    expect(built.snapshot.bodyBytes).toBeGreaterThan(0);
    expect(built.snapshot.headers.find((header) => header.name === "X-Client")?.value).toBe(
      "onir-cms",
    );
  });

  it("refuse un champ obligatoire absent", async () => {
    const deps = dependencies();
    await expect(
      buildWebhookRequest(
        deps,
        endpoint({
          fieldMappings: [
            {
              source: "field",
              field: "contact",
              target: "contact",
              required: true,
              fileMode: "signed_url",
            },
          ],
        }),
        { ...FICHE, data: {} },
      ),
    ).rejects.toThrow(/contact/);
  });

  it("construit le payload depuis le snapshot d'une fiche de collecte", async () => {
    const definition: TemplateDefinition = {
      key: "partenaire",
      label: "Partenaire",
      description: "",
      systemPrompt: "",
      fields: [
        { name: "nom", label: "Nom", type: "text", required: true },
        { name: "types", label: "Types", type: "multi", required: false },
      ],
      renderTemplate: "# {{nom}}",
    };
    const built = await buildWebhookRequest(
      dependencies(),
      endpoint({
        chatLinkId: "77777777-7777-4777-8777-777777777777",
        ficheKey: "partenaire",
        fieldMappings: [
          { source: "field", field: "nom", target: "nom", required: true, fileMode: "signed_url" },
          {
            source: "field",
            field: "types",
            target: "types",
            required: false,
            fileMode: "signed_url",
          },
        ],
      }),
      {
        ...FICHE,
        definition,
        configId: "88888888-8888-4888-8888-888888888888",
        ficheKey: "partenaire",
        chatLinkIds: ["77777777-7777-4777-8777-777777777777"],
        data: { nom: "ACME", types: ["Financier", "Expertise"] },
      },
    );
    const body = JSON.parse(built.request.body.toString("utf8")) as Record<string, unknown>;
    expect(body.nom).toBe("ACME");
    expect(body.types).toEqual(["Financier", "Expertise"]);
  });

  it("construit une requête multipart avec une pièce jointe", async () => {
    const attachment: FicheAttachment = {
      id: "55555555-5555-4555-8555-555555555555",
      organizationId: FICHE.organizationId,
      conversationId: "66666666-6666-4666-8666-666666666666",
      messageId: null,
      fieldName: "cin",
      fieldLabel: "CIN",
      originalName: "cin.txt",
      mime: "text/plain",
      sizeBytes: 7,
      storageKey:
        "orgs/22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666.txt",
      sha256: "a".repeat(64),
      createdAt: "2026-10-26T10:00:00.000Z",
      ficheId: FICHE.id,
    };
    const built = await buildWebhookRequest(
      dependencies([attachment]),
      endpoint({
        bodyMode: "multipart",
        fieldMappings: [
          {
            source: "field",
            field: "contact",
            target: "contact",
            required: true,
            fileMode: "signed_url",
          },
          {
            source: "attachment",
            field: "cin",
            target: "cin",
            required: true,
            fileMode: "multipart",
          },
        ],
      }),
      FICHE,
    );
    expect(built.request.contentType).toContain("multipart/form-data; boundary=");
    expect(built.request.body.toString("utf8")).toContain('name="cin"; filename="cin.txt"');
    expect(built.attachmentCount).toBe(1);
    expect(built.snapshot.bodyPreview).toContain("cin.txt");
  });
});
