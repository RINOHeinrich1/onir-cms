import { describe, expect, it } from "vitest";
import { compareTemplateVersions, latestTemplateVersion } from "@/domain/template-version";

describe("versions de template", () => {
  it("compare les versions numériquement, pas alphabétiquement", () => {
    expect(compareTemplateVersions({ version: "1.10.0" }, { version: "1.9.0" })).toBeGreaterThan(0);
    expect(compareTemplateVersions({ version: "v2.0.0" }, { version: "1.99.99" })).toBeGreaterThan(
      0,
    );
  });

  it("départage les versions égales par date de création", () => {
    expect(
      compareTemplateVersions(
        { version: "1.0.0", createdAt: "2026-02-01" },
        { version: "1.0.0", createdAt: "2026-01-01" },
      ),
    ).toBeGreaterThan(0);
  });

  it("retourne la version la plus récente", () => {
    expect(
      latestTemplateVersion([
        { version: "1.9.0", createdAt: "2026-03-01" },
        { version: "1.10.0", createdAt: "2026-01-01" },
        { version: "1.2.0", createdAt: "2026-04-01" },
      ])?.version,
    ).toBe("1.10.0");
  });
});
