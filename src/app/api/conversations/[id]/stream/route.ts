import { toDashboardChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import {
  type ConversationUpdatesDependencies,
  getConversationUpdates,
} from "@/application/use-cases/conversations/list-conversations";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { type ChatRealtimeEvent, sseFrame, subscribeChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

type RouteContext = { params: Promise<{ id: string }> };

function deps(): ConversationUpdatesDependencies {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    operatorScopes: pgChatOperatorScopeRepository(pool),
  };
}

/**
 * GET /api/conversations/[id]/stream?after= — flux SSE opérateur (ADR-0043).
 * Authentification par session + périmètre de liens ; repli polling côté client.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    const afterParam = new URL(request.url).searchParams.get("after");
    const after =
      afterParam !== null && !Number.isNaN(new Date(afterParam).getTime())
        ? new Date(afterParam).toISOString()
        : null;
    await getConversationUpdates(deps(), actor, id, after);

    const encoder = new TextEncoder();
    let cleanup = (): void => undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let lastAfter = after;
        const send = (frame: string): void => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            closed = true;
          }
        };
        const sendState = async (): Promise<void> => {
          const updates = await getConversationUpdates(deps(), actor, id, lastAfter);
          send(
            sseFrame("state", {
              conversation: updates.conversation,
              awaitingOperator:
                updates.conversation.interventionMode === "human" &&
                updates.conversation.lastVisitorMessageAt !== null &&
                (updates.conversation.lastOperatorMessageAt === null ||
                  updates.conversation.lastVisitorMessageAt >
                    updates.conversation.lastOperatorMessageAt),
            }),
          );
          for (const message of updates.messages) {
            send(sseFrame("message", toDashboardChatMessage(message), message.id));
            lastAfter = message.createdAt;
          }
        };

        const unsubscribe = subscribeChatRealtime(id, (event: ChatRealtimeEvent) => {
          if (event.type === "message") {
            send(sseFrame("message", toDashboardChatMessage(event.message), event.message.id));
            lastAfter = event.message.createdAt;
            return;
          }
          void sendState().catch(() => {
            // Le polling de secours prendra le relais côté client.
          });
        });
        const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

        cleanup = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Déjà fermé par le client.
          }
        };
        request.signal.addEventListener("abort", cleanup, { once: true });

        void sendState().catch(() => {
          // Le polling de secours prendra le relais côté client.
        });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
