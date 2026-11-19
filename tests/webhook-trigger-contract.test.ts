import { describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { WebhookFieldMapping, WebhookTrigger } from "@/domain/entities/webhook";
import {
  missingRequiredMappings,
  missingRequiredPayloadMappings,
} from "@/domain/webhook-trigger-contract";

const definition: TemplateDefinition = {
  key: "commande",
  label: "Commande",
  description: "",
  systemPrompt: "",
  renderTemplate: "",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: false },
  ],
};

function mapping(field: string, required = true): WebhookFieldMapping {
  return { source: "field", field, target: field, required, fileMode: "signed_url" };
}

function trigger(
  eventType: WebhookTrigger["eventType"],
  fieldKey: string | null = null,
): WebhookTrigger {
  return { eventType, fieldKey };
}

describe("webhook trigger contract", () => {
  it("refuse required_fields_filled quand un mapping requis est facultatif", () => {
    expect(
      missingRequiredMappings(
        [trigger("fiche.draft.required_fields_filled")],
        [mapping("email")],
        definition,
      ),
    ).toEqual([{ trigger: "fiche.draft.required_fields_filled", field: "email" }]);
  });

  it("accepte all_fields_filled pour un champ facultatif requis par le webhook", () => {
    expect(
      missingRequiredMappings(
        [trigger("fiche.draft.all_fields_filled")],
        [mapping("email")],
        definition,
      ),
    ).toEqual([]);
  });

  it("refuse field_filled qui ne garantit pas les autres champs requis", () => {
    expect(
      missingRequiredMappings(
        [trigger("fiche.draft.field_filled", "email")],
        [mapping("nom"), mapping("email")],
        definition,
      ),
    ).toContainEqual({ trigger: "fiche.draft.field_filled", field: "nom" });
  });

  it("refuse validated avec un mapping requis sur un champ facultatif", () => {
    expect(
      missingRequiredMappings([trigger("fiche.validated")], [mapping("email")], definition),
    ).toHaveLength(1);
  });

  it("garde runtime signale un champ requis absent", () => {
    expect(
      missingRequiredPayloadMappings([mapping("nom")], definition, {
        data: { nom: "" },
        attachmentCounts: {},
        conversationId: "conversation",
        prospectId: null,
      }),
    ).toEqual(["nom"]);
  });
});
