import { describe, expect, it } from "vitest";
import { ChatbotBlockedError } from "@/application/errors";
import {
  assertChatLinkAvailable,
  assertTokenBudgetAvailable,
} from "@/application/use-cases/chat/chat-link-quota";
import { parseLinkQuotas } from "@/application/use-cases/links/link-fields";
import {
  type ChatLinkQuota,
  chatLinkBlockReason,
  effectiveTokensUsed,
} from "@/domain/entities/chat";

function quota(overrides: Partial<ChatLinkQuota> = {}): ChatLinkQuota {
  return {
    maxFiches: null,
    fichesGenerated: 0,
    maxTokens: null,
    tokensUsed: 0,
    tokenResetMode: "manual",
    tokenResetDays: null,
    tokenPeriodStartedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("quotas chatbot — résolution du blocage", () => {
  it("bloque quand la limite de fiches à vie est atteinte", () => {
    expect(chatLinkBlockReason({ quotas: quota({ maxFiches: 2, fichesGenerated: 2 }) })).toBe(
      "fiches",
    );
    expect(chatLinkBlockReason({ quotas: quota({ maxFiches: 2, fichesGenerated: 1 }) })).toBeNull();
  });

  it("bloque quand le budget tokens est atteint", () => {
    expect(chatLinkBlockReason({ quotas: quota({ maxTokens: 100, tokensUsed: 100 }) })).toBe(
      "tokens",
    );
    expect(chatLinkBlockReason({ quotas: quota({ maxTokens: 100, tokensUsed: 99 }) })).toBeNull();
  });

  it("considère une période échue comme remise à zéro", () => {
    const expired = quota({
      maxTokens: 100,
      tokensUsed: 100,
      tokenResetMode: "duration",
      tokenResetDays: 30,
      tokenPeriodStartedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });
    expect(effectiveTokensUsed(expired, new Date("2026-03-15T00:00:00.000Z"))).toBe(0);
    expect(
      chatLinkBlockReason({ quotas: expired }, new Date("2026-03-15T00:00:00.000Z")),
    ).toBeNull();
  });

  it("lève une erreur 423 sur un chatbot bloqué", () => {
    expect(() => assertChatLinkAvailable({ quotas: quota({ maxFiches: 0 }) })).toThrow(
      ChatbotBlockedError,
    );
    expect(() => assertTokenBudgetAvailable({ quotas: quota({ maxTokens: 0 }) })).toThrow(
      ChatbotBlockedError,
    );
  });
});

describe("parseLinkQuotas", () => {
  it("accepte des limites vides et une réinitialisation manuelle", () => {
    expect(parseLinkQuotas({ maxFiches: "", maxTokens: null })).toEqual({
      maxFiches: null,
      maxTokens: null,
      tokenResetMode: "manual",
      tokenResetDays: null,
    });
  });

  it("accepte une durée automatique", () => {
    expect(
      parseLinkQuotas({
        maxFiches: "100",
        maxTokens: "500000",
        tokenResetMode: "duration",
        tokenResetDays: "30",
      }),
    ).toEqual({
      maxFiches: 100,
      maxTokens: 500000,
      tokenResetMode: "duration",
      tokenResetDays: 30,
    });
  });

  it("refuse une durée absente ou hors bornes", () => {
    expect(() => parseLinkQuotas({ tokenResetMode: "duration", tokenResetDays: "" })).toThrow(
      /Durée/,
    );
    expect(() => parseLinkQuotas({ tokenResetMode: "duration", tokenResetDays: "0" })).toThrow(
      /Durée/,
    );
  });
});
