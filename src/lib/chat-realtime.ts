import type { ChatMessage } from "@/domain/entities/chat";

/**
 * Bus temps réel local au process (ADR-0043).
 * Le SSE est le chemin nominal ; le polling de secours couvre une instance
 * redémarrée ou un événement manqué. Une diffusion multi-instance passera
 * ultérieurement par PostgreSQL LISTEN/NOTIFY.
 */
export type ChatRealtimeEvent = { type: "message"; message: ChatMessage } | { type: "state" };

type Listener = (event: ChatRealtimeEvent) => void;

type RealtimeState = {
  listeners: Map<string, Set<Listener>>;
};

const globalState = globalThis as typeof globalThis & {
  __onirChatRealtime?: RealtimeState;
};

const state: RealtimeState = globalState.__onirChatRealtime ?? { listeners: new Map() };
if (globalState.__onirChatRealtime === undefined) {
  globalState.__onirChatRealtime = state;
}

export function subscribeChatRealtime(conversationId: string, listener: Listener): () => void {
  const set = state.listeners.get(conversationId) ?? new Set<Listener>();
  set.add(listener);
  state.listeners.set(conversationId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) state.listeners.delete(conversationId);
  };
}

export function publishChatRealtime(conversationId: string, event: ChatRealtimeEvent): void {
  const set = state.listeners.get(conversationId);
  if (set === undefined) return;
  for (const listener of set) listener(event);
}

/** Trame SSE : `event`, `data` JSON et éventuel `id`. */
export function sseFrame(event: string, data: unknown, id?: string): string {
  const lines = [`event: ${event}`];
  if (id !== undefined) lines.push(`id: ${id}`);
  lines.push(`data: ${JSON.stringify(data)}`, "", "");
  return lines.join("\n");
}
