import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/domain/password";

describe("password — hachage scrypt (RM-AUTH-001)", () => {
  it("vérifie un mot de passe correct", () => {
    const hash = hashPassword("S3cret!pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("S3cret!pass", hash)).toBe(true);
  });

  it("refuse un mot de passe incorrect", () => {
    const hash = hashPassword("S3cret!pass");
    expect(verifyPassword("mauvais", hash)).toBe(false);
  });

  it("génère un sel aléatoire (deux hachages diffèrent)", () => {
    expect(hashPassword("identique")).not.toBe(hashPassword("identique"));
  });

  it("ne conserve jamais le mot de passe en clair", () => {
    const hash = hashPassword("monMotDePasseEnClair");
    expect(hash.includes("monMotDePasseEnClair")).toBe(false);
  });

  it("refuse une empreinte malformée", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlysalt")).toBe(false);
  });
});
