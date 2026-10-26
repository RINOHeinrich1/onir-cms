import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateIp } from "@/infrastructure/web/safe-url";

describe("safe-url (crawler ADR-0038)", () => {
  it("détecte les plages IPv4 et IPv6 privées", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.1.1",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });

  it("refuse les schémas, identifiants et adresses privées", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://user:pass@example.com")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://192.168.0.2")).rejects.toThrow();
  });

  it("accepte une URL publique sans résolution DNS", async () => {
    await expect(assertPublicHttpUrl("https://8.8.8.8/path")).resolves.toBeInstanceOf(URL);
  });
});
