import { beforeAll, describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "@/lib/secret-box";

describe("secret-box (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "test-session-secret-pour-secret-box";
  });

  it("chiffre et déchiffre un secret", () => {
    const sealed = sealSecret("ed5976001756a914fe31868180d8caa06e6329b416044933");
    expect(sealed.ciphertext).not.toContain("ed5976");
    expect(openSecret(sealed)).toBe("ed5976001756a914fe31868180d8caa06e6329b416044933");
  });

  it("rejette un chiffré altéré (tag d'authentification)", () => {
    const sealed = sealSecret("secret");
    const tampered = { ...sealed, ciphertext: Buffer.from("x").toString("base64") };
    expect(() => openSecret(tampered)).toThrow();
  });
});
