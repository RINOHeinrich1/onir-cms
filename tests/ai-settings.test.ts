import { describe, expect, it } from "vitest";
import { decideAiAssignment } from "@/domain/entities/ai-settings";

const legacy = { token: "t", productId: "p", model: "Qwen/Qwen3.5" };

describe("ai-settings — précédence de résolution", () => {
  it("priorise le choix explicite du lien", () => {
    expect(
      decideAiAssignment({
        link: { aiProviderId: "link-provider", aiModel: "link-model" },
        organization: { defaultProviderId: "org-provider", defaultModel: "org-model" },
        legacy,
      }),
    ).toEqual({ source: "link", providerId: "link-provider", model: "link-model" });
  });

  it("utilise le défaut de l'organisation si le lien hérite", () => {
    expect(
      decideAiAssignment({
        link: { aiProviderId: null, aiModel: null },
        organization: { defaultProviderId: "org-provider", defaultModel: "org-model" },
        legacy,
      }),
    ).toEqual({ source: "organization", providerId: "org-provider", model: "org-model" });
  });

  it("retombe sur le legacy si aucun défaut n'existe", () => {
    expect(
      decideAiAssignment({
        link: { aiProviderId: null, aiModel: null },
        organization: { defaultProviderId: null, defaultModel: null },
        legacy,
      }),
    ).toEqual({ source: "legacy" });
  });

  it("signale l'absence totale de configuration", () => {
    expect(
      decideAiAssignment({
        link: { aiProviderId: null, aiModel: null },
        organization: { defaultProviderId: null, defaultModel: null },
        legacy: null,
      }),
    ).toEqual({ source: "none" });
  });

  it("refuse une paire de lien incomplète", () => {
    expect(() =>
      decideAiAssignment({
        link: { aiProviderId: "p", aiModel: null },
        organization: { defaultProviderId: null, defaultModel: null },
        legacy,
      }),
    ).toThrow();
  });
});
