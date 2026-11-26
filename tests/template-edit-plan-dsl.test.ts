import { describe, expect, it } from "vitest";
import { validatePlanDsl } from "@/domain/template-edit-plan-dsl";

function codes(value: unknown): string[] {
  const result = validatePlanDsl(value);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("validation du Plan DSL v1", () => {
  it("accepte un plan relationnel avec $ref", () => {
    const result = validatePlanDsl({
      schemaVersion: 1,
      intent: "create",
      steps: [
        {
          id: "page",
          operation: {
            op: "insert",
            target: { kind: "collection", collection: "pages" },
            values: { title: "Nos Services", slug: "nos-services" },
          },
        },
        {
          id: "action",
          operation: {
            op: "insert",
            target: { kind: "collection", collection: "actions" },
            values: { kind: "navigate_page", target: { $ref: "page" } },
          },
        },
        {
          id: "menu",
          operation: {
            op: "set",
            candidateId: "blocks:service",
            field: "action_id",
            value: { $ref: "action" },
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("refuse une cible set sous forme de chaîne", () => {
    expect(
      codes({
        schemaVersion: 1,
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              target: "blocks:service",
              data: { action_id: "action" },
            },
          },
        ],
      }),
    ).toContain("INVALID_TARGET_KIND");
  });

  it("refuse un set sans value", () => {
    expect(
      codes({
        schemaVersion: 1,
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              candidateId: "blocks:service",
              field: "action_id",
            },
          },
        ],
      }),
    ).toContain("MISSING_REQUIRED_PROPERTY");
  });

  it("refuse steps + clarification", () => {
    expect(
      codes({
        schemaVersion: 1,
        clarification: "précisez",
        steps: [
          {
            id: "one",
            operation: {
              op: "set",
              target: { kind: "param", path: "global_theme.color_primary" },
              value: "#000000",
            },
          },
        ],
      }),
    ).toContain("STEPS_AND_CLARIFICATION_CONFLICT");
  });

  it("refuse une référence vers une étape future", () => {
    expect(
      codes({
        schemaVersion: 1,
        steps: [
          {
            id: "action",
            operation: {
              op: "insert",
              target: { kind: "collection", collection: "actions" },
              values: { kind: "navigate_page", target: { $ref: "page" } },
            },
          },
          {
            id: "page",
            operation: {
              op: "insert",
              target: { kind: "collection", collection: "pages" },
              values: { title: "Nos Services" },
            },
          },
        ],
      }),
    ).toContain("INVALID_REF_ORDER");
  });

  it("refuse un plan de plus de 20 étapes", () => {
    const steps = Array.from({ length: 21 }, (_, index) => ({
      id: `step-${index}`,
      operation: {
        op: "set",
        target: { kind: "param", path: "global_theme.color_primary" },
        value: "#000000",
      },
    }));
    expect(codes({ schemaVersion: 1, steps })).toContain("TOO_MANY_STEPS");
  });
});
