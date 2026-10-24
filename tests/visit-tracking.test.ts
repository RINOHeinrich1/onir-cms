import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "@/lib/visit-tracking";

describe("isBotUserAgent", () => {
  it("laisse passer un navigateur classique", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("reconnaît les robots de recherche et d'aperçu", () => {
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "facebookexternalhit/1.1",
      "Slackbot-LinkExpanding 1.0",
      "Mozilla/5.0 (compatible; GPTBot/1.2)",
    ]) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  });

  it("reconnaît les outils automatisés", () => {
    for (const ua of [
      "curl/8.7.1",
      "Wget/1.21",
      "python-requests/2.32",
      "HeadlessChrome/131.0.0.0",
      "Lighthouse/12.0.0",
    ]) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  });

  it("ne classe pas un User-Agent absent comme robot", () => {
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent("")).toBe(false);
  });
});
