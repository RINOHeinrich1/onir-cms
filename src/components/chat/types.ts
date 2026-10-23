import type { ChatMessageMedia } from "@/domain/entities/chat";

/** Message de chat exposé au client (public). */
export type ChatMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  medias: ChatMessageMedia[];
  createdAt: string;
};
