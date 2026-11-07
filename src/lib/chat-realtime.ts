export type { ChatRealtimeEvent } from "@/domain/chat-realtime";

/** Trame SSE : `event`, `data` JSON et éventuel `id`. */
export function sseFrame(event: string, data: unknown, id?: string): string {
  const lines = [`event: ${event}`];
  if (id !== undefined) lines.push(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(data)}`, "", "");
  return lines.join("\n");
}
