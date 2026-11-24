import { describe, expect, it } from "vitest";
import { ValidationError } from "@/application/errors";
import type {
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import { prepareLinkParams } from "@/application/use-cases/links/link-params";
import { puzzleV2Editor, puzzleV2Params } from "./fixtures/puzzle-v2-reference";

function repository(version: VisualTemplateVersion): VisualTemplateRepository {
  return {
    findVersion: async () => version,
  } as unknown as VisualTemplateRepository;
}

const version = {
  manifest: { params: puzzleV2Params, editor: puzzleV2Editor },
} as unknown as VisualTemplateVersion;

describe("prepareLinkParams — identifiants de collection", () => {
  it("refuse un doublon avant persistance", async () => {
    await expect(
      prepareLinkParams(repository(version), "template", "1.0.0", {
        blocks: [
          {
            id: "hero",
            kind: "hero",
            name: "Hero",
            title: "",
            description: "",
            style_id: "",
            action_id: "",
          },
          {
            id: "hero",
            kind: "card",
            name: "Doublon",
            title: "",
            description: "",
            style_id: "",
            action_id: "",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse un identifiant vide avant persistance", async () => {
    await expect(
      prepareLinkParams(repository(version), "template", "1.0.0", {
        blocks: [
          {
            id: "",
            kind: "hero",
            name: "Hero",
            title: "",
            description: "",
            style_id: "",
            action_id: "",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepte une collection aux identifiants uniques", async () => {
    await expect(
      prepareLinkParams(repository(version), "template", "1.0.0", {
        blocks: [
          {
            id: "hero",
            kind: "hero",
            name: "Hero",
            title: "",
            description: "",
            style_id: "",
            action_id: "",
          },
          {
            id: "card",
            kind: "card",
            name: "Carte",
            title: "",
            description: "",
            style_id: "",
            action_id: "",
          },
        ],
      }),
    ).resolves.toBeTruthy();
  });
});
