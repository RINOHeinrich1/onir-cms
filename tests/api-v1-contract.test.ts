import { describe, expect, it } from "vitest";
import { openapiDocument } from "@/contracts/api-v1/openapi";
import { parseApiKeyScopes } from "@/domain/entities/api-key";

type Operation = {
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  "x-required-scopes"?: string[];
  responses?: Record<string, unknown>;
};

function operations(): Array<{ path: string; method: string; operation: Operation }> {
  const document = openapiDocument();
  const paths = document.paths as Record<string, Record<string, Operation>>;
  return Object.entries(paths).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) =>
        ["get", "post", "patch", "put", "delete", "head", "options"].includes(method),
      )
      .map(([method, operation]) => ({ path, method, operation })),
  );
}

describe("API key scopes", () => {
  it("defaults to fiches:read", () => {
    expect(parseApiKeyScopes(undefined)).toEqual({ ok: true, scopes: ["fiches:read"] });
  });

  it("deduplicates and validates known scopes", () => {
    expect(parseApiKeyScopes(["prospects:read", "prospects:read", "chatbots:write"])).toEqual({
      ok: true,
      scopes: ["prospects:read", "chatbots:write"],
    });
    expect(parseApiKeyScopes(["medias:read", "connaissances:write"])).toEqual({
      ok: true,
      scopes: ["medias:read", "connaissances:write"],
    });
    expect(parseApiKeyScopes(["unknown:read"]).ok).toBe(false);
    expect(parseApiKeyScopes([]).ok).toBe(false);
  });
});

describe("OpenAPI v1 contract", () => {
  const document = openapiDocument();

  it("declares bearer authentication", () => {
    expect(document.components).toMatchObject({
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    });
  });

  it("covers the public resources", () => {
    const paths = Object.keys(document.paths as Record<string, unknown>);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/me",
        "/fiches",
        "/prospects",
        "/conversations",
        "/chatbots",
        "/modeles",
        "/statistiques/summary",
        "/webhooks",
        "/webhook-deliveries/{id}/retry",
        "/medias",
        "/medias/{id}",
        "/connaissances",
        "/connaissances/{id}",
      ]),
    );
  });

  it("gives every operation an operationId and scopes", () => {
    const ids = new Set<string>();
    for (const { path, method, operation } of operations()) {
      expect(operation.operationId, `${method.toUpperCase()} ${path}`).toBeTruthy();
      expect(operation["x-required-scopes"], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(ids.has(operation.operationId ?? "")).toBe(false);
      ids.add(operation.operationId ?? "");
    }
  });

  it("documents authentication failures", () => {
    for (const { path, method, operation } of operations()) {
      expect(operation.responses?.["401"], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation.responses?.["403"], `${method.toUpperCase()} ${path}`).toBeDefined();
    }
  });
});
