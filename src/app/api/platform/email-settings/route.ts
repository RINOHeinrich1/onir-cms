import { NextResponse } from "next/server";
import {
  getPlatformEmailSettings,
  savePlatformEmailSettings,
} from "@/application/use-cases/email/email-settings-service";
import type { EmailSettingsInput } from "@/domain/entities/email-settings";
import { pgEmailSettingsRepository } from "@/infrastructure/db/email-settings-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { booleanField, readJsonObject, stringField } from "../../_lib/http";
import { requireSuperAdmin } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

function inputFromBody(body: Record<string, unknown>): EmailSettingsInput {
  return {
    host: stringField(body, "host") ?? "",
    port: Number(body.port ?? 0),
    secure: booleanField(body, "secure") ?? true,
    username: stringField(body, "username") ?? "",
    password: stringField(body, "password") ?? "",
    fromEmail: stringField(body, "fromEmail") ?? "",
    fromName: stringField(body, "fromName") ?? "",
    replyTo: stringField(body, "replyTo") ?? "",
    status: stringField(body, "status") === "disabled" ? "disabled" : "active",
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    return NextResponse.json({
      settings: await getPlatformEmailSettings(pgEmailSettingsRepository(getPool())),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    return NextResponse.json({
      settings: await savePlatformEmailSettings(
        pgEmailSettingsRepository(getPool()),
        actor.id,
        inputFromBody(body),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
