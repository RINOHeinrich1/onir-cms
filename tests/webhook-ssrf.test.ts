import { describe, expect, it } from "vitest";
import { isPrivateWebhookAddress, resolveWebhookTarget } from "@/lib/webhook-ssrf";

describe("webhook SSRF — classification", () => {
  it("refuse les plages IPv4 privées et spéciales", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.4.8",
      "192.168.1.5",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "198.18.0.1",
    ]) {
      expect(isPrivateWebhookAddress(address), address).toBe(true);
    }
  });

  it("accepte les IPv4 publiques", () => {
    expect(isPrivateWebhookAddress("8.8.8.8")).toBe(false);
    expect(isPrivateWebhookAddress("1.1.1.1")).toBe(false);
    expect(isPrivateWebhookAddress("203.0.114.10")).toBe(false);
  });

  it("refuse loopback, ULA, link-local et multicast IPv6", () => {
    for (const address of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateWebhookAddress(address), address).toBe(true);
    }
    expect(isPrivateWebhookAddress("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateWebhookAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("webhook SSRF — résolution", () => {
  it("accepte une IP publique sans DNS", async () => {
    const target = await resolveWebhookTarget("https://8.8.8.8/hook", false);
    expect(target.addresses).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("refuse loopback et identifiants dans l'URL", async () => {
    await expect(resolveWebhookTarget("http://127.0.0.1/hook", false)).rejects.toThrow();
    await expect(
      resolveWebhookTarget("https://user:pass@example.com/hook", false),
    ).rejects.toThrow();
  });

  it("refuse les métadonnées même avec allowPrivateNetwork", async () => {
    await expect(
      resolveWebhookTarget("http://169.254.169.254/latest/meta-data", true, true),
    ).rejects.toThrow(/métadonnées/);
  });

  it("refuse les protocoles autres que http(s)", async () => {
    await expect(resolveWebhookTarget("file:///etc/passwd", false)).rejects.toThrow();
    await expect(resolveWebhookTarget("ftp://example.com/hook", false)).rejects.toThrow();
  });
});
