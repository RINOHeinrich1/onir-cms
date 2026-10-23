import { describe, expect, it } from "vitest";
import { assertAllowedAiBaseUrl } from "@/lib/ai-url-policy";

describe("ai-url-policy — SSRF", () => {
  it("accepte une URL HTTPS publique et retire le slash final", () => {
    expect(assertAllowedAiBaseUrl("https://api.openai.com/v1/", { allowPrivate: false })).toBe(
      "https://api.openai.com/v1",
    );
  });

  it("refuse HTTP sans autorisation privée", () => {
    expect(() =>
      assertAllowedAiBaseUrl("http://localhost:11434/v1", { allowPrivate: false }),
    ).toThrow();
  });

  it("accepte un fournisseur local uniquement avec allowPrivate", () => {
    expect(assertAllowedAiBaseUrl("http://localhost:11434/v1", { allowPrivate: true })).toBe(
      "http://localhost:11434/v1",
    );
  });

  it("refuse les réseaux privés et le loopback par défaut", () => {
    for (const host of ["http://10.0.0.1/v1", "http://192.168.1.5/v1", "http://127.0.0.1/v1"]) {
      expect(() => assertAllowedAiBaseUrl(host, { allowPrivate: false })).toThrow();
    }
  });

  it("refuse toujours les métadonnées cloud, même en mode privé", () => {
    expect(() =>
      assertAllowedAiBaseUrl("http://169.254.169.254/latest", { allowPrivate: true }),
    ).toThrow();
  });

  it("refuse les identifiants et les query strings", () => {
    expect(() =>
      assertAllowedAiBaseUrl("https://user:pass@api.example.com/v1", { allowPrivate: false }),
    ).toThrow();
    expect(() =>
      assertAllowedAiBaseUrl("https://api.example.com/v1?x=1", { allowPrivate: false }),
    ).toThrow();
  });
});
