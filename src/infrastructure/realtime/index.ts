import type { ChatEventBus } from "@/application/ports/chat-event-bus";
import { realtimeMode, valkeyUrl } from "@/lib/env";
import { DisabledChatEventBus } from "./disabled-chat-event-bus";
import { InProcessChatEventBus } from "./in-process-chat-event-bus";
import { ValkeyChatEventBus } from "./valkey-chat-event-bus";

const globalState = globalThis as typeof globalThis & {
  __onirChatEventBus?: ChatEventBus | undefined;
};

export function getChatEventBus(): ChatEventBus {
  if (globalState.__onirChatEventBus !== undefined) return globalState.__onirChatEventBus;
  const mode = realtimeMode();
  let bus: ChatEventBus;
  if (mode === "valkey") {
    const url = valkeyUrl();
    if (url === undefined) throw new Error("REALTIME_MODE=valkey exige VALKEY_URL");
    bus = new ValkeyChatEventBus(url);
  } else if (mode === "polling") {
    bus = new DisabledChatEventBus();
  } else {
    bus = new InProcessChatEventBus();
  }
  globalState.__onirChatEventBus = bus;
  return bus;
}

export function resetChatEventBusForTests(): void {
  globalState.__onirChatEventBus = undefined;
}
