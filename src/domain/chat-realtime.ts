import type { ChatMessage } from "@/domain/entities/chat";

export type ChatRealtimeEvent = { type: "message"; message: ChatMessage } | { type: "state" };
