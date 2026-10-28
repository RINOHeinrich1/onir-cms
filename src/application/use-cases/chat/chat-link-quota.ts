import { ChatbotBlockedError } from "@/application/errors";
import {
  type ChatLink,
  chatLinkBlockReason,
  chatLinkQuota,
  effectiveTokensUsed,
} from "@/domain/entities/chat";

/** Refuse un chatbot dont le quota de fiches ou de tokens est atteint (ADR-0048). */
export function assertTokenBudgetAvailable(link: Pick<ChatLink, "quotas">): void {
  const quota = chatLinkQuota(link);
  if (quota.maxTokens !== null && effectiveTokensUsed(quota) >= quota.maxTokens) {
    throw new ChatbotBlockedError(
      "Ce chatbot a atteint son budget de tokens. Contactez l'équipe pour le réinitialiser.",
    );
  }
}

export function assertChatLinkAvailable(link: Pick<ChatLink, "quotas">): void {
  const reason = chatLinkBlockReason(link);
  if (reason === "fiches") {
    throw new ChatbotBlockedError(
      "Ce chatbot a atteint sa limite de fiches. Contactez l'équipe pour l'augmenter.",
    );
  }
  if (reason === "tokens") {
    throw new ChatbotBlockedError(
      "Ce chatbot a atteint son budget de tokens. Contactez l'équipe pour le réinitialiser.",
    );
  }
}
