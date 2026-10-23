import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateTemplateDefinition } from "@/domain/template-schema";

const SEED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/infrastructure/db/migrations/0010_seed_templates.sql",
);

function extractSeedDefinitions(): unknown[] {
  const sql = readFileSync(SEED_PATH, "utf8");
  const blocks: unknown[] = [];
  const marker = "$json$";
  let rest = sql;
  while (true) {
    const start = rest.indexOf(marker);
    if (start === -1) break;
    const end = rest.indexOf(marker, start + marker.length);
    if (end === -1) break;
    const raw = rest.slice(start + marker.length, end).trim();
    // Ignore les mentions du marqueur dans les commentaires (pas du JSON).
    if (raw.startsWith("{")) {
      blocks.push(JSON.parse(raw));
    }
    rest = rest.slice(end + marker.length);
  }
  return blocks;
}

/**
 * Garantit un seed valide : chaque définition du SQL se parse et passe
 * la validation, et `fiche-projet` reproduit le jeu de champs historique.
 */
describe("seed 0010_seed_templates.sql", () => {
  it("extrait 3 définitions valides", () => {
    const definitions = extractSeedDefinitions();
    expect(definitions).toHaveLength(3);
    for (const definition of definitions) {
      const result = validateTemplateDefinition(definition);
      expect(result.ok).toBe(true);
    }
  });

  it("fiche-projet : jeu de champs historique", () => {
    const definitions = extractSeedDefinitions() as Array<{
      key?: string;
      fields?: Array<{ name?: string }>;
    }>;
    const fiche = definitions.find((definition) => definition.key === "fiche-projet");
    expect(fiche).toBeDefined();
    expect(fiche?.fields?.map((field) => field.name)).toEqual([
      "plateformes",
      "description",
      "budget",
      "duree",
      "contact",
      "statut",
      "contraintesTechno",
      "lienDocSpec",
    ]);
  });
});
