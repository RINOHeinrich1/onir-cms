import Redis from "ioredis";
import type { ChatEventBus } from "@/application/ports/chat-event-bus";
import type { ChatRealtimeEvent } from "@/domain/chat-realtime";

type Listener = (event: ChatRealtimeEvent) => void;

const CHANNEL_PREFIX = "onir:chat:";

function channel(conversationId: string): string {
  return `${CHANNEL_PREFIX}${conversationId}`;
}

export class ValkeyChatEventBus implements ChatEventBus {
  readonly mode = "valkey" as const;
  readonly supportsSse = true;
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Map<string, Set<Listener>>();
  private publisherConnected = false;
  private subscriberConnected = false;

  constructor(url: string) {
    const options = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    } as const;
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.publisher.on("error", () => undefined);
    this.subscriber.on("error", () => undefined);
    this.subscriber.on("message", (receivedChannel: string, payload: string) => {
      const set = this.listeners.get(receivedChannel);
      if (set === undefined) return;
      try {
        const event = JSON.parse(payload) as ChatRealtimeEvent;
        for (const listener of set) listener(event);
      } catch {
        // Message invalide : ignoré, le polling corrigera l'état.
      }
    });
  }

  private async connectPublisher(): Promise<void> {
    if (this.publisherConnected) return;
    if (this.publisher.status === "wait") await this.publisher.connect();
    this.publisherConnected = true;
  }

  private async connectSubscriber(): Promise<void> {
    if (this.subscriberConnected) return;
    if (this.subscriber.status === "wait") await this.subscriber.connect();
    this.subscriberConnected = true;
  }

  async publish(conversationId: string, event: ChatRealtimeEvent): Promise<void> {
    await this.connectPublisher();
    await this.publisher.publish(channel(conversationId), JSON.stringify(event));
  }

  async subscribe(
    conversationId: string,
    handler: (event: ChatRealtimeEvent) => void,
  ): Promise<() => void> {
    await this.connectSubscriber();
    const topic = channel(conversationId);
    const set = this.listeners.get(topic) ?? new Set<Listener>();
    const isFirst = set.size === 0;
    set.add(handler);
    this.listeners.set(topic, set);
    if (isFirst) await this.subscriber.subscribe(topic);
    let active = true;
    return async () => {
      if (!active) return;
      active = false;
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(topic);
        await this.subscriber.unsubscribe(topic);
      }
    };
  }
}
