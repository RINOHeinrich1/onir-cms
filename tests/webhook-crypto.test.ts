import { beforeAll, describe, expect, it } from "vitest";
import {
  isSealedWebhookSecret,
  openWebhookJson,
  openWebhookSecret,
  sealWebhookJson,
  sealWebhookSecret,
} from "@/lib/webhook-crypto";

const KEY = "c".repeat(64);

describe("webhook-crypto — AES-256-GCM dédié", () => {
  beforeAll(() => {
    process.env.WEBHOOK_SECRET_KEY = KEY;
  });

  it("scelle et ouvre une chaîne sans exposer la valeur", () => {
    const sealed = sealWebhookSecret("partenaire-super-secret");
    expect(isSealedWebhookSecret(sealed)).toBe(true);
    expect(sealed).not.toContain("partenaire-super-secret");
    expect(openWebhookSecret(sealed)).toBe("partenaire-super-secret");
  });

  it("scelle et ouvre un objet JSON", () => {
    const sealed = sealWebhookJson({ type: "bearer", token: "abc" });
    expect(openWebhookJson(sealed)).toEqual({ type: "bearer", token: "abc" });
  });

  it("rejette un chiffré altéré", () => {
    const sealed = sealWebhookSecret("secret");
    const parts = sealed.split(":");
    const ciphertext = parts[3] ?? "";
    const tampered = [...parts.slice(0, 3), `${ciphertext.slice(0, -1)}A`].join(":");
    expect(() => openWebhookSecret(tampered)).toThrow();
  });
});
