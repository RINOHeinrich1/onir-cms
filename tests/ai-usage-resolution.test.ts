import { describe, expect, it } from "vitest";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import { resolveUsageTargets } from "@/application/use-cases/ai/resolve-usage-targets";
import type { AiCluster, AiUsageDefault } from "@/domain/entities/ai-usage";

function cluster(id: string, members: { providerId: string; model: string }[]): AiCluster {
  return {
    id,
    organizationId: "org-1",
    label: id,
    description: "",
    actif: true,
    members: members.map((member, index) => ({
      position: index + 1,
      providerId: member.providerId,
      model: member.model,
      enabled: true,
    })),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function defaults(rows: AiUsageDefault[]): AiUsageRepository {
  return {
    listDefaults: async () => rows,
    listClusters: async () => [
      cluster("extraction-cluster", [
        { providerId: "p1", model: "m1" },
        { providerId: "p2", model: "m2" },
      ]),
    ],
    listLinkOverrides: async () => [],
  } as unknown as AiUsageRepository;
}

describe("résolution IA par usage", () => {
  it("applique le défaut response puis le fallback du cluster", async () => {
    const targets = await resolveUsageTargets(
      {
        usage: defaults([
          { usage: "response", target: { kind: "cluster", clusterId: "extraction-cluster" } },
        ]),
      },
      { organizationId: "org-1", usage: "response" },
    );
    expect(targets).toEqual([
      { organizationId: "org-1", aiProviderId: "p1", aiModel: "m1" },
      { organizationId: "org-1", aiProviderId: "p2", aiModel: "m2" },
    ]);
  });

  it("fait hériter la sélection de la réponse effective", async () => {
    const targets = await resolveUsageTargets(
      {
        usage: defaults([
          { usage: "response", target: { kind: "model", providerId: "p1", model: "response" } },
        ]),
      },
      { organizationId: "org-1", usage: "selection" },
    );
    expect(targets).toEqual([{ organizationId: "org-1", aiProviderId: "p1", aiModel: "response" }]);
  });

  it("un override de lien prime sur le défaut d’usage", async () => {
    const usage = defaults([
      { usage: "selection", target: { kind: "model", providerId: "p1", model: "default" } },
    ]);
    usage.listLinkOverrides = async () => [
      { usage: "selection", target: { kind: "model", providerId: "p2", model: "override" } },
    ];
    const targets = await resolveUsageTargets(
      { usage },
      { organizationId: "org-1", usage: "selection", chatLinkId: "link-1" },
    );
    expect(targets).toEqual([{ organizationId: "org-1", aiProviderId: "p2", aiModel: "override" }]);
  });

  it("ne donne aucune cible assistant sans défaut", async () => {
    const targets = await resolveUsageTargets(
      { usage: defaults([]) },
      { organizationId: "org-1", usage: "assistant" },
    );
    expect(targets).toEqual([]);
  });
});
