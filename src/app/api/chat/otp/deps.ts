import type { EmailOtpDependencies } from "@/application/use-cases/otp/email-otp";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgEmailSettingsRepository } from "@/infrastructure/db/email-settings-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { pgOtpChallengeRepository } from "@/infrastructure/db/otp-challenge-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";

export function emailOtpDependencies(): EmailOtpDependencies {
  const pool = getPool();
  return {
    links: pgChatLinkRepository(pool),
    organizations: pgOrganizationRepository(pool),
    challenges: pgOtpChallengeRepository(pool),
    emailSettings: pgEmailSettingsRepository(pool),
  };
}

export function startConversationDependencies() {
  const pool = getPool();
  return {
    organizations: pgOrganizationRepository(pool),
    links: pgChatLinkRepository(pool),
    conversations: pgConversationRepository(pool),
    prospects: pgProspectRepository(pool),
    configs: pgChatbotConfigRepository(pool),
    ficheInstances: pgConversationFicheInstanceRepository(pool),
  };
}

export { pgConversationRepository };
