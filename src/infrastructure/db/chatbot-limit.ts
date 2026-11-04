import { OrganizationChatbotLimitError } from "@/application/errors";

type PgError = Error & { code?: string };

/** Traduit l'invariant SQL `max_chatbots` en erreur applicative lisible. */
export function rethrowOrganizationChatbotLimit(error: unknown): void {
  const pgError = error as PgError;
  if (
    pgError instanceof Error &&
    pgError.code === "P0001" &&
    pgError.message.includes("organization_chatbot_limit_reached")
  ) {
    throw new OrganizationChatbotLimitError();
  }
}
