import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { isAppSecretKey } from "@/infrastructure/config/app-secret-crypto";
import { generateAppSecret, replaceAppSecret } from "@/infrastructure/config/app-secrets";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-super-admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string }> };

/** POST /api/admin/app-secrets/:key — génère ou remplace un secret (super-admin). */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await requireSuperAdmin(request);
    const { key: rawKey } = await context.params;
    const key = rawKey.toUpperCase();
    if (!isAppSecretKey(key)) throw new ValidationError("Secret applicatif inconnu");

    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const mode = body.mode;
    if (mode === "generate") {
      const result = await generateAppSecret(session.actor.id, key);
      return NextResponse.json(
        { generatedValue: result.generatedValue, overview: result.status },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (mode === "replace") {
      const value = body.value;
      if (typeof value !== "string") {
        throw new ValidationError("La nouvelle valeur est requise");
      }
      const result = await replaceAppSecret(session.actor.id, key, value);
      return NextResponse.json(
        { generatedValue: null, overview: result.status },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    throw new ValidationError("Mode invalide : generate ou replace");
  } catch (error) {
    return errorResponse(error);
  }
}
