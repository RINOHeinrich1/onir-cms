import { NextResponse } from "next/server";
import { requestEmailOtp } from "@/application/use-cases/otp/email-otp";
import { isChatLinkSurface } from "@/domain/entities/chat";
import { chatOtpLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../../_lib/errors";
import { booleanField, clientIp, readJsonObject, stringField } from "../../../_lib/http";
import { emailOtpDependencies } from "../deps";

export const dynamic = "force-dynamic";

/** POST /api/chat/otp/request — demande un code OTP par email (ADR-0099). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const token = stringField(body, "token");
    const email = stringField(body, "email");
    if (token === undefined || email === undefined) {
      return NextResponse.json({ error: "Lien ou email manquant" }, { status: 400 });
    }
    const limit = chatOtpLimiter(`${clientIp(request)}:${token}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de demandes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const surfaceRaw = stringField(body, "surface");
    const surface = surfaceRaw !== undefined && isChatLinkSurface(surfaceRaw) ? surfaceRaw : "page";
    const challenge = await requestEmailOtp(emailOtpDependencies(), {
      token,
      email,
      consentement: booleanField(body, "consentement") === true,
      surface,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    });
    return NextResponse.json(challenge);
  } catch (error) {
    return errorResponse(error);
  }
}
