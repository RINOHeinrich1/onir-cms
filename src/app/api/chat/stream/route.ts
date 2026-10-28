import { NotFoundError } from "@/application/errors";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatPollLimiter } from "@/lib/chat-limiters";
import { sseFrame, subscribeChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../../_lib/errors";
import { clientIp } from "../../_lib/http";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * GET /api/chat/stream?conversationId=&after= — flux SSE visiteur (ADR-0043).
 * Le client bascule en polling si le flux échoue. L'UUID de conversation est
 * la capability ; aucune donnée inter-organisations.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() ?? "";
    if (conversationId === "") {
      return Response.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const limit = chatPollLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return Response.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const conversations = pgConversationRepository(pool);
    const conversation = await conversations.findByIdPublic(conversationId);
    if (conversation === null) throw new NotFoundError("Conversation introuvable");
    const organization = await pgOrganizationRepository(pool).findById(conversation.organizationId);
    if (organization === null || organization.suspendedAt !== null) {
      throw new NotFoundError("Conversation introuvable");
    }

    const afterParam = url.searchParams.get("after");
    const after =
      afterParam !== null && !Number.isNaN(new Date(afterParam).getTime())
        ? new Date(afterParam).toISOString()
        : null;

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
          const current = await conversations.findByIdPublic(conversationId);
          if (current === null) return;
          send(
            sseFrame("state", {
              mode: current.interventionMode,
              statut: current.statut,
            }),
          );
        };
        const sendMessage = (message: Parameters<typeof toPublicChatMessage>[0]): void => {
          send(
            sseFrame(
              "message",
              toPublicChatMessage(message, conversation.organizationId),
              message.id,
            ),
          );
          lastAfter = message.createdAt;
        };

        const unsubscribe = subscribeChatRealtime(conversationId, (event) => {
          if (event.type === "message") {
            sendMessage(event.message);
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

        void (async () => {
          await sendState();
          const backlog = await conversations.listMessagesAfter(
            conversation.organizationId,
            conversation.id,
            lastAfter,
          );
          for (const message of backlog) sendMessage(message);
        })().catch(() => {
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
