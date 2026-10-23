import { describe, expect, it } from "vitest";
import { DEFAULT_LINK_SOURCES, parseLinkSources } from "@/domain/entities/chat";

describe("parseLinkSources — options data: d'un lien", () => {
  it("défaut : toutes les sources activées", () => {
    expect(DEFAULT_LINK_SOURCES).toEqual({
      connaissances: true,
      phototheque: true,
      lien: true,
    });
    expect(parseLinkSources(undefined)).toEqual(DEFAULT_LINK_SOURCES);
    expect(parseLinkSources(null)).toEqual(DEFAULT_LINK_SOURCES);
    expect(parseLinkSources("texte")).toEqual(DEFAULT_LINK_SOURCES);
  });

  it("respecte les booléens fournis", () => {
    expect(parseLinkSources({ connaissances: false, phototheque: true, lien: false })).toEqual({
      connaissances: false,
      phototheque: true,
      lien: false,
    });
  });

  it("complète les clés manquantes par le défaut", () => {
    expect(parseLinkSources({ phototheque: false })).toEqual({
      connaissances: true,
      phototheque: false,
      lien: true,
    });
  });
});
