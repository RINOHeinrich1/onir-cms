import { describe, expect, it } from "vitest";
import {
  canActivateStandaloneBuild,
  isStandaloneDomainActive,
  isValidStandaloneHostname,
  normalizeStandaloneHostname,
  standaloneBuildArtifactPrefix,
} from "@/domain/standalone";

describe("domaine standalone (ADR-0106)", () => {
  it("normalise un hostname HTTP et retire le port", () => {
    expect(normalizeStandaloneHostname(" WWW.Client.COM:443 ")).toBe("www.client.com");
    expect(normalizeStandaloneHostname("client.com.")).toBe("client.com");
  });

  it("valide les hostnames publics", () => {
    expect(isValidStandaloneHostname("client.com")).toBe(true);
    expect(isValidStandaloneHostname("www.client.com")).toBe(true);
    expect(isValidStandaloneHostname("bad_host.com")).toBe(false);
    expect(isValidStandaloneHostname("-bad.com")).toBe(false);
    expect(isValidStandaloneHostname("localhost")).toBe(false);
  });

  it("n'active que les builds prêts", () => {
    expect(canActivateStandaloneBuild("ready")).toBe(true);
    expect(canActivateStandaloneBuild("building")).toBe(false);
    expect(canActivateStandaloneBuild("active")).toBe(false);
  });

  it("considère un domaine actif seulement si vérifié et SSL actif", () => {
    expect(isStandaloneDomainActive({ verificationStatus: "verified", sslStatus: "active" })).toBe(
      true,
    );
    expect(isStandaloneDomainActive({ verificationStatus: "verified", sslStatus: "issuing" })).toBe(
      false,
    );
  });

  it("protège le préfixe d'artefact contre les chemins arbitraires", () => {
    const link = "912bffda-2445-4a76-bfc6-957984edfca4";
    const build = "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0";
    expect(standaloneBuildArtifactPrefix(link, build)).toBe(`standalone-builds/${link}/${build}`);
    expect(() => standaloneBuildArtifactPrefix("../escape", build)).toThrow();
  });
});
