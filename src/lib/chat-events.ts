import type { ChatRealtimeEvent } from "@/domain/chat-realtime";
import { getChatEventBus } from "@/infrastructure/realtime";

/** Publication non bloquante : un échec du bus ne doit pas casser la requête. */
export function publishChatEvent(conversationId: string, event: ChatRealtimeEvent): void {
  void getChatEventBus()
    .publish(conversationId, event)
    .catch((error: unknown) => {
      process.stderr.write(`[chat-events] publication impossible : ${String(error)}\n`);
    });
}
