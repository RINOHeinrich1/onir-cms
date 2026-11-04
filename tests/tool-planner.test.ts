import { describe, expect, it } from "vitest";
import {
  buildPlannerToolCatalog,
  PLANNER_RETRY_SUFFIX,
  parsePlannerOutput,
} from "@/domain/tool-planner";

describe("parsePlannerOutput (ADR-0067 §7.2)", () => {
  it("accepte une action d'outil avec arguments objet", () => {
    expect(
      parsePlannerOutput('{"action":"search_fiches","arguments":{"ficheTypes":["maison"]}}'),
    ).toEqual({ action: "search_fiches", arguments: { ficheTypes: ["maison"] } });
  });

  it("accepte une action finale non vide", () => {
    expect(parsePlannerOutput('{"action":"final","text":"Bonjour"}')).toEqual({
      action: "final",
      text: "Bonjour",
    });
  });

  it("tolère une clôture markdown autour du JSON", () => {
    expect(parsePlannerOutput('```json\n{"action":"final","text":"ok"}\n```')).toEqual({
      action: "final",
      text: "ok",
    });
  });

  it("rejette un JSON invalide, une action inconnue, un final vide et des arguments non-objet", () => {
    expect(parsePlannerOutput("pas du json")).toBeNull();
    expect(parsePlannerOutput('{"action":"drop_table"}')).toBeNull();
    expect(parsePlannerOutput('{"action":"final","text":"   "}')).toBeNull();
    expect(parsePlannerOutput('{"action":"search_fiches","arguments":"oops"}')).toBeNull();
    expect(parsePlannerOutput("[]")).toBeNull();
  });

  it("normalise des arguments absents en objet vide", () => {
    expect(parsePlannerOutput('{"action":"list_fiche_types"}')).toEqual({
      action: "list_fiche_types",
      arguments: {},
    });
  });

  it("construit un catalogue d'outils sans statut ni fichier", () => {
    const catalog = buildPlannerToolCatalog([{ name: "search_fiches", description: "Recherche." }]);
    expect(catalog).toContain("search_fiches");
    expect(catalog).not.toMatch(/status|statut|file/i);
  });

  it("la consigne de retry demande un JSON strict", () => {
    expect(PLANNER_RETRY_SUFFIX).toContain("JSON");
  });
});
