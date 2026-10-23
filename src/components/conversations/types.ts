import type { ConversationSummary } from "@/application/ports/conversation-repository";
import type { ChatMessageDto } from "@/components/chat/types";

/** Ligne de la liste des conversations. */
export type ConversationRowDto = ConversationSummary;
export type { ChatMessageDto };
