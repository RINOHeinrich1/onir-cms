import { describe, expect, it } from "vitest";
import {
  assertMappingsForDefinition,
  parseWebhookConfig,
} from "@/application/use-cases/webhooks/parse-webhook-config";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { WebhookEndpoint } from "@/domain/entities/webhook";

const DEFINITION: TemplateDefinition = {
  key: "lead-demo",
  label: "Lead démo",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "contact", label: "Contact", type: "text", required: true },
    { name: "budget", label: "Budget", type: "text", required: false },
  ],
  renderTemplate: "# {{contact}}",
};

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Stockage partenaire",
    templateKey: "lead-demo",
    url: "https://partner.example.com/hooks/leads",
    httpMethod: "POST",
    bodyMode: "json",
    fieldMappings: [{ source: "field", field: "contact", target: "contact", required: true }],
    auth: { type: "none" },
    ...overrides,
  };
}

describe("parseWebhookConfig", () => {
  it("normalise une configuration minimale avec les valeurs par défaut", () => {
    const parsed = parseWebhookConfig(input());
    expect(parsed.timeoutMs).toBe(10_000);
    expect(parsed.maxAttempts).toBe(3);
    expect(parsed.followRedirects).toBe(false);
    expect(parsed.tlsVerify).toBe(true);
    expect(parsed.auth).toEqual({ type: "none" });
  });

  it("refuse un nom trop court", () => {
    expect(() => parseWebhookConfig(input({ name: "x" }))).toThrow(/au moins/);
  });

  it("refuse une URL avec identifiants ou protocole non http(s)", () => {
    expect(() =>
      parseWebhookConfig(input({ url: "https://user:pass@example.com/hook" })),
    ).toThrow();
    expect(() => parseWebhookConfig(input({ url: "ftp://example.com/hook" }))).toThrow();
  });

  it("refuse les en-têtes réservés et les doublons de cible", () => {
    expect(() =>
      parseWebhookConfig(input({ headers: [{ name: "Host", value: "evil", secret: false }] })),
    ).toThrow(/réservé/);
    expect(() =>
      parseWebhookConfig(
        input({
          fieldMappings: [
            { source: "field", field: "contact", target: "x" },
            { source: "field", field: "budget", target: "x" },
          ],
        }),
      ),
    ).toThrow(/double/);
  });

  it("refuse une pièce jointe multipart dans un corps JSON", () => {
    expect(() =>
      parseWebhookConfig(
        input({
          fieldMappings: [
            {
              source: "attachment",
              field: "cin",
              target: "cin",
              required: true,
              fileMode: "multipart",
            },
          ],
        }),
      ),
    ).toThrow(/multipart/);
  });

  it("conserve les secrets non ressaisis lors d'une édition", () => {
    const existing = {
      auth: { type: "bearer", token: "ancien-token" },
      headers: [{ name: "X-Api-Key", value: "ancienne-cle", secret: true }],
      queryParams: [],
      bodyTemplate: "",
    } as unknown as WebhookEndpoint;
    const parsed = parseWebhookConfig(
      input({
        auth: { type: "bearer", token: "" },
        headers: [{ name: "X-Api-Key", value: "", secret: true }],
      }),
      existing,
    );
    expect(parsed.auth).toEqual({ type: "bearer", token: "ancien-token" });
    expect(parsed.headers[0]?.value).toBe("ancienne-cle");
  });

  it("valide les champs contre le modèle", () => {
    const parsed = parseWebhookConfig(
      input({
        fieldMappings: [
          { source: "field", field: "contact", target: "contact" },
          { source: "prospect", field: "email", target: "prospect.email" },
        ],
      }),
    );
    expect(() => assertMappingsForDefinition(parsed.fieldMappings, DEFINITION)).not.toThrow();
    expect(() =>
      assertMappingsForDefinition(
        [
          {
            source: "field",
            field: "inconnu",
            target: "x",
            required: false,
            fileMode: "signed_url",
          },
        ],
        DEFINITION,
      ),
    ).toThrow(/inconnu/);
  });
});
