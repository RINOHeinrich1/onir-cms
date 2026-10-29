import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { createFiche } from "@/application/use-cases/fiche/manage-fiches";
import { renderFicheDocument } from "@/application/use-cases/fiche/render-fiche";
import { type Fiche, MANUAL_FICHE_DEFINITION } from "@/domain/entities/fiche";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const DATA = {
  plateformes: ["site web"],
  description: "Refonte du site",
  budget: "10 000 €",
  duree: "3 mois",
  contact: "client@example.com",
  statut: "initier",
  contraintesTechno: "",
  lienDocSpec: "",
};

function fiche(overrides: Partial<Fiche> = {}): Fiche {
  return {
    id: "fiche-1",
    organizationId: "org-1",
    conversationId: null,
    prospectId: null,
    createdBy: "user-1",
    definition: MANUAL_FICHE_DEFINITION,
    templateKey: null,
    templateVersion: null,
    data: DATA,
    plateformes: DATA.plateformes,
    description: DATA.description,
    budget: DATA.budget,
    duree: DATA.duree,
    contact: DATA.contact,
    statut: "initier",
    contraintesTechno: "",
    lienDocSpec: "",
    archivee: false,
    chatLinkIds: [],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

async function create(overrides: Record<string, unknown> = {}) {
  const create = vi.fn(async (_organizationId: string, _input: unknown) => fiche());
  const deps = { fiches: { create } as unknown as FicheRepository };
  const result = await createFiche(deps, ACTOR, {
    data: DATA,
    chatLinkIds: ["link-1"],
    ...overrides,
  });
  return { result, create };
}

describe("fiche manuelle sans modèle de raisonnement", () => {
  it("crée une fiche avec un snapshot local et 0..N chatbots", async () => {
    const { create: createMock } = await create();
    expect(createMock).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        templateKey: null,
        templateVersion: null,
        definition: MANUAL_FICHE_DEFINITION,
        chatLinkIds: ["link-1"],
      }),
    );
  });

  it("refuse une fiche manuelle incomplète", async () => {
    const create = vi.fn(async () => fiche());
    await expect(
      createFiche({ fiches: { create } as unknown as FicheRepository }, ACTOR, {
        data: { ...DATA, description: "" },
      }),
    ).rejects.toThrow(/Description du projet/);
  });

  it("rend une fiche depuis son snapshot sans appeler chat_templates", async () => {
    const templates = {
      findVersion: vi.fn(async () => {
        throw new Error("chat_templates ne doit pas être appelé");
      }),
    } as unknown as ChatTemplateRepository;
    const rendered = await renderFicheDocument(
      {
        fiches: {} as FicheRepository,
        templates,
        prospects: { findById: async () => null } as unknown as ProspectRepository,
        attachments: { listByFiche: async () => [] } as unknown as AttachmentRepository,
      },
      "org-1",
      fiche({ chatLinkIds: ["link-1"] }),
    );
    expect(rendered.markdown).toContain("Refonte du site");
    expect(rendered.markdown).toContain("10 000 €");
    expect(templates.findVersion).not.toHaveBeenCalled();
  });
});
