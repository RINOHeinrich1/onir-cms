import { describe, expect, it } from "vitest";
import { buildAgentObservation } from "@/application/use-cases/visual-templates/agent-poc/agent-observation";
import { puzzleV2Values } from "./fixtures/puzzle-v2-reference";

describe("observation structurée du template", () => {
  it("résume l’état et conserve le rendu", () => {
    const values = JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
    const observation = buildAgentObservation({
      values,
      render: {
        revision: 4,
        text: "header\nmain",
        header: "Accueil",
        main: "Bienvenue",
      },
    });

    expect(observation.revision).toBe(4);
    expect(observation.stateHash).not.toBe("");
    expect(observation.counts.blocks).toBe(values.blocks?.length ?? 0);
    expect(observation.counts.placements).toBe(values.placements?.length ?? 0);
    expect(observation.render.main).toBe("Bienvenue");
    expect(observation.pages.some((page) => page.id === "home")).toBe(true);
  });
});
