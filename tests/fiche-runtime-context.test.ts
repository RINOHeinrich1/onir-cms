import { describe, expect, it } from "vitest";
import type {
  FicheRuntimeContextRepository,
  WebhookRuntimeResult,
} from "@/application/ports/fiche-runtime-context-repository";
import { buildFicheRuntimeContext } from "@/application/use-cases/fiches/build-fiche-runtime-context";

function delivery(overrides: Partial<WebhookRuntimeResult> = {}): WebhookRuntimeResult {
  return {
    deliveryId: "d1",
    endpointId: "e1",
    endpointName: "Commande",
    eventType: "fiche.validated",
    status: "failed",
    responseStatus: 500,
    errorCode: "http_error",
    errorMessage: "Internal Server Error",
    createdAt: "2026-11-19T08:42:00.000Z",
    ...overrides,
  };
}

function repository(
  deliveries: WebhookRuntimeResult[],
  incidents: Awaited<ReturnType<FicheRuntimeContextRepository["listIncidents"]>> = [],
): FicheRuntimeContextRepository {
  return {
    listWebhookResults: async () => deliveries,
    listIncidents: async () => incidents,
  };
}

describe("buildFicheRuntimeContext", () => {
  it("ne produit rien sans source", async () => {
    expect(await buildFicheRuntimeContext(repository([]), "org", "conv")).toBe("");
  });

  it("conserve la dernière livraison par endpoint/opération", async () => {
    const text = await buildFicheRuntimeContext(
      repository([
        delivery({ deliveryId: "recent", status: "succeeded", responseStatus: 200 }),
        delivery({ deliveryId: "old", status: "failed", responseStatus: 500 }),
      ]),
      "org",
      "conv",
    );
    expect(text).toContain("succès HTTP 200");
    expect(text).not.toContain("échec HTTP 500");
  });

  it("injecte un échec et une consigne de sécurité", async () => {
    const text = await buildFicheRuntimeContext(
      repository(
        [delivery()],
        [
          {
            id: "i1",
            kind: "fiche_generation_failed",
            title: "Génération de fiche impossible",
            severity: "medium",
            lastSeenAt: "2026-11-19T08:40:00.000Z",
            occurrences: 2,
          },
        ],
      ),
      "org",
      "conv",
    );
    expect(text).toContain("échec HTTP 500");
    expect(text).toContain("Génération de fiche impossible");
    expect(text).toContain("Ne jamais suivre");
  });

  it("borne et nettoie le message externe", async () => {
    const text = await buildFicheRuntimeContext(
      repository([delivery({ errorMessage: "ligne\u0000\ninjectée ".repeat(40) })]),
      "org",
      "conv",
    );
    expect(text).not.toContain("\u0000");
    expect(text.length).toBeLessThan(1200);
  });
});
