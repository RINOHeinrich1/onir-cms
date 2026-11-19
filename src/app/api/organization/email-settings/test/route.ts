import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { sendTestEmail } from "@/application/use-cases/email/email-settings-service";
import { pgEmailSettingsRepository } from "@/infrastructure/db/email-settings-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole, requireUser } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireUser(request);
    await requireRole(request, "emailsettings:manage");
    if (session.actor.organizationId === null)
      throw new ValidationError("Organisation active requise");
    await sendTestEmail(
      pgEmailSettingsRepository(getPool()),
      session.actor.organizationId,
      session.user.email,
    );
    return NextResponse.json({ ok: true, to: session.user.email });
  } catch (error) {
    return errorResponse(error);
  }
}
