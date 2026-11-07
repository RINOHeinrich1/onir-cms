import type { ChatRealtimeEvent } from "@/domain/chat-realtime";

export type ChatEventBusMode = "local" | "valkey" | "polling";

export interface ChatEventBus {
  readonly mode: ChatEventBusMode;
  readonly supportsSse: boolean;
  publish(conversationId: string, event: ChatRealtimeEvent): Promise<void>;
  subscribe(
    conversationId: string,
    handler: (event: ChatRealtimeEvent) => void,
  ): Promise<() => void>;
}
