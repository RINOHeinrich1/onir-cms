import { beforeAll, describe, expect, it } from "vitest";
import {
  fingerprintAppSecret,
  generateAppSecretValue,
  openAppSecret,
  sealAppSecret,
  validateGeneratedAppSecret,
} from "@/infrastructure/config/app-secret-crypto";

const MASTER = "d".repeat(64);

describe("app-secret-crypto — chiffrement des secrets de configuration", () => {
  beforeAll(() => {
    process.env.CONFIG_MASTER_KEY = MASTER;
  });

  it("génère et valide 64 caractères hexadécimaux", () => {
    const value = generateAppSecretValue();
    expect(value).toHaveLength(64);
    expect(validateGeneratedAppSecret(value)).toBe(true);
    expect(validateGeneratedAppSecret("abc")).toBe(false);
  });

  it("scelle et ouvre une valeur avec l'AAD de la clé", () => {
    const value = "a".repeat(64);
    const sealed = sealAppSecret("LINK_TOKEN_KEY", value, Buffer.from(MASTER, "hex"));
    expect(sealed).not.toContain(value);
    expect(openAppSecret("LINK_TOKEN_KEY", sealed, Buffer.from(MASTER, "hex"))).toBe(value);
    expect(() => openAppSecret("AI_PROVIDER_KEY", sealed, Buffer.from(MASTER, "hex"))).toThrow();
  });

  it("calcule une empreinte stable et non réversible", () => {
    const value = "b".repeat(64);
    const fingerprint = fingerprintAppSecret(value);
    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).toBe(fingerprintAppSecret(value));
    expect(fingerprint).not.toContain(value);
  });
});
