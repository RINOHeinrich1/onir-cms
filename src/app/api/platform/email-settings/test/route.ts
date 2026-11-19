import { NextResponse } from "next/server";
import { ForbiddenError } from "@/application/errors";
import { sendPlatformTestEmail } from "@/application/use-cases/email/email-settings-service";
import { pgEmailSettingsRepository } from "@/infrastructure/db/email-settings-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireUser } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireUser(request);
    if (!session.actor.isSuperAdmin) throw new ForbiddenError("Super-admin requis");
    await sendPlatformTestEmail(pgEmailSettingsRepository(getPool()), session.user.email);
    return NextResponse.json({ ok: true, to: session.user.email });
  } catch (error) {
    return errorResponse(error);
  }
}
