import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateTemplateManifest } from "@/domain/entities/visual-template";

describe("rétrocompatibilité Editor V1 — Natural World 1.1.0", () => {
  it("valide le manifeste réel sans migration", () => {
    const manifest = JSON.parse(
      readFileSync("tests/fixtures/natural-world-1.1.0.template.json", "utf8"),
    ) as unknown;
    const result = validateTemplateManifest(manifest);
    if (!result.ok) console.error(result.errors);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.editor?.version).toBe(1);
    expect(result.value.params.length).toBeGreaterThan(0);
  });
});
