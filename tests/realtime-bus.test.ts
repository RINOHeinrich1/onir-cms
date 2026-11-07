import { describe, expect, it } from "vitest";
import { DisabledChatEventBus } from "@/infrastructure/realtime/disabled-chat-event-bus";
import { InProcessChatEventBus } from "@/infrastructure/realtime/in-process-chat-event-bus";

describe("chat event bus", () => {
  it("diffuse localement et se désabonne", async () => {
    const bus = new InProcessChatEventBus();
    const received: string[] = [];
    const unsubscribe = await bus.subscribe("c1", (event) => {
      if (event.type === "state") received.push("state");
    });
    await bus.publish("c1", { type: "state" });
    await unsubscribe();
    await bus.publish("c1", { type: "state" });
    expect(received).toEqual(["state"]);
  });

  it("le mode polling refuse le SSE", async () => {
    const bus = new DisabledChatEventBus();
    expect(bus.supportsSse).toBe(false);
    await expect(bus.subscribe("c1", () => undefined)).rejects.toThrow("polling");
  });
});
