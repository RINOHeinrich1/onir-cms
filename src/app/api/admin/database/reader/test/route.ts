import { NextResponse } from "next/server";
import { UnprocessableError } from "@/application/errors";
import { testTemplateReaderConnection } from "@/application/use-cases/visual-templates/manage-template-reader";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateReaderAccountStore } from "@/infrastructure/db/template-reader-account-store";
import { pgTemplateReaderCredentialsRepository } from "@/infrastructure/db/template-reader-credentials-repository";
import { withTemplateReaderLock } from "@/infrastructure/db/template-reader-lock";
import { pgTemplateReaderProvisioner } from "@/infrastructure/db/template-reader-provisioner";
import { errorResponse } from "../../../../_lib/errors";
import { requireSuperAdmin } from "../../../../_lib/require-super-admin";

export const dynamic = "force-dynamic";

/** POST — teste la connexion de lecture réellement utilisée par le runtime. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    const pool = getPool();
    try {
      const result = await withTemplateReaderLock(pool, () =>
        testTemplateReaderConnection({
          credentials: pgTemplateReaderCredentialsRepository(pool),
          provisioner: pgTemplateReaderProvisioner(pool),
          accounts: pgTemplateReaderAccountStore(pool),
        }),
      );
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Aucun compte de lecture configuré") {
        throw new UnprocessableError("Aucun compte de lecture configuré");
      }
      throw new UnprocessableError(
        "Connexion de lecture impossible (identifiants, rôle ou réseau)",
      );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
