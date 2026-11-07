import type { ChatEventBus } from "@/application/ports/chat-event-bus";
import type { ChatRealtimeEvent } from "@/domain/chat-realtime";

type Listener = (event: ChatRealtimeEvent) => void;

export class InProcessChatEventBus implements ChatEventBus {
  readonly mode = "local" as const;
  readonly supportsSse = true;
  private readonly listeners = new Map<string, Set<Listener>>();

  async publish(conversationId: string, event: ChatRealtimeEvent): Promise<void> {
    const set = this.listeners.get(conversationId);
    if (set === undefined) return;
    for (const listener of set) listener(event);
  }

  async subscribe(
    conversationId: string,
    handler: (event: ChatRealtimeEvent) => void,
  ): Promise<() => void> {
    const set = this.listeners.get(conversationId) ?? new Set<Listener>();
    set.add(handler);
    this.listeners.set(conversationId, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(conversationId);
    };
  }
}
