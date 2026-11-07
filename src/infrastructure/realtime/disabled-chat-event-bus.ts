import type { ChatEventBus } from "@/application/ports/chat-event-bus";
import type { ChatRealtimeEvent } from "@/domain/chat-realtime";

export class DisabledChatEventBus implements ChatEventBus {
  readonly mode = "polling" as const;
  readonly supportsSse = false;

  async publish(_conversationId: string, _event: ChatRealtimeEvent): Promise<void> {}

  async subscribe(
    _conversationId: string,
    _handler: (event: ChatRealtimeEvent) => void,
  ): Promise<() => void> {
    throw new Error("SSE désactivé : mode polling");
  }
}
