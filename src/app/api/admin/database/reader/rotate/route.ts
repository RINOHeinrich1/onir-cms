import { NextResponse } from "next/server";
import { rotateTemplateReaderPassword } from "@/application/use-cases/visual-templates/manage-template-reader";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateReaderAccountStore } from "@/infrastructure/db/template-reader-account-store";
import { pgTemplateReaderCredentialsRepository } from "@/infrastructure/db/template-reader-credentials-repository";
import { withTemplateReaderLock } from "@/infrastructure/db/template-reader-lock";
import { pgTemplateReaderProvisioner } from "@/infrastructure/db/template-reader-provisioner";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject } from "../../../../_lib/http";
import { requireSuperAdmin } from "../../../../_lib/require-super-admin";

export const dynamic = "force-dynamic";

/**
 * POST — génère un mot de passe, l'applique au rôle de connexion et le stocke
 * chiffré. Le mot de passe n'est renvoyé qu'une fois (affichage panneau).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await requireSuperAdmin(request);
    const pool = getPool();
    const body = await readJsonObject(request);
    const result = await withTemplateReaderLock(pool, () =>
      rotateTemplateReaderPassword(
        {
          credentials: pgTemplateReaderCredentialsRepository(pool),
          provisioner: pgTemplateReaderProvisioner(pool),
          accounts: pgTemplateReaderAccountStore(pool),
        },
        session.actor.id,
        body?.validityDays,
      ),
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
