import { NextResponse } from "next/server";
import { changePassword } from "@/application/use-cases/auth/change-password";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject, stringField } from "../../_lib/http";
import { requireUser } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_found: "Utilisateur introuvable",
  inactive: "Compte désactivé",
  invalid_current: "Mot de passe actuel incorrect",
  weak_password: "Nouveau mot de passe trop court (8 caractères minimum)",
  same_password: "Le nouveau mot de passe doit différer de l'ancien",
};

/** POST /api/auth/change-password — rotation forcée (US-AUTH-001). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { user } = await requireUser(request);
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const currentPassword = stringField(body, "currentPassword");
    const newPassword = stringField(body, "newPassword");
    if (currentPassword === undefined || newPassword === undefined) {
      return NextResponse.json(
        { error: "Mot de passe actuel et nouveau mot de passe requis" },
        { status: 400 },
      );
    }

    const result = await changePassword(
      { users: pgUserRepository(getPool()) },
      { userId: user.id, currentPassword, newPassword },
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: MESSAGES[result.reason] ?? "Échec du changement de mot de passe" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
