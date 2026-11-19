import { NextResponse } from "next/server";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import { verifyEmailOtp } from "@/application/use-cases/otp/email-otp";
import { isChatLinkSurface } from "@/domain/entities/chat";
import { chatOtpLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../../_lib/http";
import { emailOtpDependencies, startConversationDependencies } from "../deps";

export const dynamic = "force-dynamic";

/** POST /api/chat/otp/verify — vérifie le code et démarre la conversation (ADR-0099). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const token = stringField(body, "token");
    const challengeId = stringField(body, "challengeId");
    const code = stringField(body, "code");
    if (token === undefined || challengeId === undefined || code === undefined) {
      return NextResponse.json({ error: "Code ou lien manquant" }, { status: 400 });
    }
    const limit = chatOtpLimiter(`${clientIp(request)}:${token}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const surfaceRaw = stringField(body, "surface");
    const surface = surfaceRaw !== undefined && isChatLinkSurface(surfaceRaw) ? surfaceRaw : "page";
    const verified = await verifyEmailOtp(emailOtpDependencies(), {
      token,
      challengeId,
      code,
      surface,
    });
    const { conversation } = await startConversation(startConversationDependencies(), {
      token,
      channel: surface,
      consentement: verified.challenge.consentement,
      verifiedEmail: {
        email: verified.challenge.email,
        verifiedAt: verified.emailVerifiedAt,
      },
    });
    const conversations = startConversationDependencies().conversations;
    const history = await conversations.listMessages(conversation.organizationId, conversation.id);
    return NextResponse.json({
      conversationId: conversation.id,
      mode: conversation.interventionMode,
      messages: history.map((message) => toPublicChatMessage(message, conversation.organizationId)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
