import { describe, expect, it } from "vitest";
import {
  defaultFicheStatusKey,
  type FicheStatusDefinition,
  findFicheStatus,
  parseFicheStatuses,
} from "@/domain/entities/fiche-status";

const NOW = "2026-11-04T12:00:00.000Z";

function status(overrides: Partial<FicheStatusDefinition> = {}) {
  return {
    key: "a_qualifier",
    label: "À qualifier",
    order: 0,
    isDefault: true,
    archivedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parseFicheStatuses", () => {
  it("accepte une liste valide et trie par ordre", () => {
    const result = parseFicheStatuses(
      [
        status({ key: "qualifie", label: "Qualifié", order: 2, isDefault: false }),
        status({ key: "a_qualifier", order: 1 }),
      ],
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.map((entry) => entry.key)).toEqual(["a_qualifier", "qualifie"]);
  });

  it("refuse les clés invalides, en double, les défauts multiples et l'absence de défaut", () => {
    expect(parseFicheStatuses([status({ key: "À qualifier" })], NOW).ok).toBe(false);
    expect(
      parseFicheStatuses([status(), status({ key: "a_qualifier", label: "Doublon" })], NOW).ok,
    ).toBe(false);
    expect(
      parseFicheStatuses([status(), status({ key: "autre", label: "Autre", isDefault: true })], NOW)
        .ok,
    ).toBe(false);
    expect(parseFicheStatuses([status({ isDefault: false })], NOW).ok).toBe(false);
  });

  it("accepte un statut archivé et conserve sa date", () => {
    const result = parseFicheStatuses([status({ archivedAt: "2026-11-03T00:00:00.000Z" })], NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.archivedAt).toBe("2026-11-03T00:00:00.000Z");
  });

  it("retourne une liste vide sans statuts", () => {
    expect(parseFicheStatuses(undefined, NOW)).toEqual({ ok: true, value: [] });
    expect(parseFicheStatuses([], NOW)).toEqual({ ok: true, value: [] });
  });
});

describe("helpers de statut", () => {
  const statuses = [
    status(),
    status({ key: "qualifie", label: "Qualifié", order: 1, isDefault: false }),
  ];

  it("résout une clé et le défaut non archivé", () => {
    expect(findFicheStatus(statuses, "qualifie")?.label).toBe("Qualifié");
    expect(findFicheStatus(statuses, "inconnu")).toBeNull();
    expect(defaultFicheStatusKey(statuses)).toBe("a_qualifier");
  });

  it("ignore un défaut archivé", () => {
    expect(
      defaultFicheStatusKey([
        status({ archivedAt: "2026-11-03T00:00:00.000Z" }),
        status({ key: "qualifie", label: "Qualifié", isDefault: false }),
      ]),
    ).toBeNull();
  });
});
