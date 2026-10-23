import { describe, expect, it } from "vitest";
import { chatMessageLimiter, chatSessionLimiter } from "@/lib/chat-limiters";

describe("chat-limiters — anti-abus endpoints publics", () => {
  it("session : 20 démarrages puis 429 logique (défaut CHAT_SESSION_LIMIT)", () => {
    const key = `test-session-${Date.now()}`;
    for (let index = 0; index < 20; index += 1) {
      expect(chatSessionLimiter(key)).toEqual({ limited: false });
    }
    const blocked = chatSessionLimiter(key);
    expect(blocked.limited).toBe(true);
    if (blocked.limited) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("messages : 20 envois puis 429 logique", () => {
    const key = `test-message-${Date.now()}`;
    for (let index = 0; index < 20; index += 1) {
      expect(chatMessageLimiter(key)).toEqual({ limited: false });
    }
    expect(chatMessageLimiter(key).limited).toBe(true);
  });
});
