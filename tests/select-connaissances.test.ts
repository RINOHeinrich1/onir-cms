import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import {
  buildContexteInterne,
  MAX_ENTREES_SELECTION,
  selectConnaissancesUtiles,
} from "@/application/use-cases/connaissances/select-connaissances";
import type { Connaissance } from "@/domain/entities/connaissance";

function entry(titre: string, contenu = "contenu"): Connaissance {
  return {
    id: titre,
    organizationId: "org-1",
    titre,
    contenu,
    templateKeys: [],
    actif: true,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("selectConnaissancesUtiles — mini-RAG par titres", () => {
  it("retient les titres connus renvoyés par le LLM", async () => {
    const ai: AiClient = {
      complete: async () => JSON.stringify({ titres: ["contact de l'entreprise"] }),
    };
    const selected = await selectConnaissancesUtiles(
      { ai },
      [entry("contact de l'entreprise"), entry("tarifs")],
      "Quel est votre email ?",
    );
    expect(selected.map((item) => item.titre)).toEqual(["contact de l'entreprise"]);
  });

  it("écarte les titres inconnus et le bruit autour du JSON", async () => {
    const ai: AiClient = {
      complete: async () => JSON.stringify({ titres: ["INCONNU", "tarifs", 42, ""] }),
    };
    const selected = await selectConnaissancesUtiles(
      { ai },
      [entry("tarifs"), entry("contact de l'entreprise")],
      "Combien ?",
    );
    expect(selected.map((item) => item.titre)).toEqual(["tarifs"]);
  });

  it("retourne [] sans casser : JSON invalide, IA en panne, vide", async () => {
    const broken: AiClient = {
      complete: async () => "pas du json {",
    };
    expect(await selectConnaissancesUtiles({ ai: broken }, [entry("a")], "Bonjour")).toEqual([]);
    const failing: AiClient = {
      complete: async () => {
        throw new Error("panne");
      },
    };
    expect(await selectConnaissancesUtiles({ ai: failing }, [entry("a")], "Bonjour")).toEqual([]);
    const ok: AiClient = { complete: vi.fn(async () => '{"titres":[]}') };
    expect(await selectConnaissancesUtiles({ ai: ok }, [], "Bonjour")).toEqual([]);
    expect(await selectConnaissancesUtiles({ ai: ok }, [entry("a")], "   ")).toEqual([]);
    expect(ok.complete).not.toHaveBeenCalled();
  });

  it("plafonne les entrées envoyées à la sélection", async () => {
    const seen: string[] = [];
    const ai: AiClient = {
      complete: async (input) => {
        const user = input.messages.find((message) => message.role === "user");
        seen.push(user?.content ?? "");
        return JSON.stringify({ titres: [] });
      },
    };
    const many = Array.from({ length: MAX_ENTREES_SELECTION + 5 }, (_, index) =>
      entry(`titre-${index}`),
    );
    await selectConnaissancesUtiles({ ai }, many, "Bonjour");
    for (let index = MAX_ENTREES_SELECTION; index < many.length; index += 1) {
      expect(seen[0]).not.toContain(`titre-${index}`);
    }
  });
});

describe("buildContexteInterne", () => {
  it("vide sans entrée", () => {
    expect(buildContexteInterne([])).toBe("");
  });

  it("formate les blocs par titre", () => {
    expect(buildContexteInterne([entry("contact de l'entreprise", "a@b.cd")])).toContain(
      "### contact de l'entreprise\na@b.cd",
    );
  });
});
