import { describe, expect, it } from "vitest";
import { validateMissionDecomposition } from "@/application/use-cases/visual-templates/agent-poc/mission-objective";

function objective(key: string, dependencies: string[] = []) {
  return {
    key,
    title: `Objectif ${key}`,
    goal: "Un résultat observable.",
    acceptanceCriteria: ["Le résultat est observable."],
    evidence: [{ kind: "state", description: "Hash de révision." }],
    dependencies,
    constraints: [],
  };
}

function decomposition(objectives: unknown[]) {
  return { schemaVersion: 1, reason: "Décomposition.", objectives };
}

describe("contrat des objectifs de mission", () => {
  it("accepte une décomposition structurellement valide sans juger le sens", () => {
    const result = validateMissionDecomposition(decomposition([objective("objectif-vague", [])]));
    expect(result.ok).toBe(true);
  });

  it("refuse une clé dupliquée", () => {
    const result = validateMissionDecomposition(
      decomposition([objective("meme-cle"), objective("meme-cle")]),
    );
    expect(result.ok).toBe(false);
  });

  it("refuse un cycle de dépendances", () => {
    const result = validateMissionDecomposition(
      decomposition([objective("a", ["b"]), objective("b", ["a"])]),
    );
    expect(result.ok).toBe(false);
  });

  it("refuse un objectif sans preuve", () => {
    const withoutEvidence = { ...objective("sans-preuve"), evidence: [] };
    const result = validateMissionDecomposition(decomposition([withoutEvidence]));
    expect(result.ok).toBe(false);
  });

  it("refuse une preuve de type inconnu", () => {
    const invalid = {
      ...objective("preuve-invalide"),
      evidence: [{ kind: "magic", description: "x" }],
    };
    const result = validateMissionDecomposition(decomposition([invalid]));
    expect(result.ok).toBe(false);
  });

  it("accepte une dépendance vers un objectif existant", () => {
    const result = validateMissionDecomposition(
      decomposition([objective("nouvel-objectif", ["ancien-objectif"])]),
      ["ancien-objectif"],
    );
    expect(result.ok).toBe(true);
  });
});
