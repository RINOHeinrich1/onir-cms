import { NextResponse } from "next/server";
import {
  getTemplateReaderStatus,
  updateTemplateReaderValidity,
} from "@/application/use-cases/visual-templates/manage-template-reader";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateReaderAccountStore } from "@/infrastructure/db/template-reader-account-store";
import { pgTemplateReaderCredentialsRepository } from "@/infrastructure/db/template-reader-credentials-repository";
import { withTemplateReaderLock } from "@/infrastructure/db/template-reader-lock";
import { pgTemplateReaderProvisioner } from "@/infrastructure/db/template-reader-provisioner";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-super-admin";

export const dynamic = "force-dynamic";

/** GET — état du compte de lecture des données (super-admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    const pool = getPool();
    const status = await getTemplateReaderStatus({
      credentials: pgTemplateReaderCredentialsRepository(pool),
      provisioner: pgTemplateReaderProvisioner(pool),
      accounts: pgTemplateReaderAccountStore(pool),
    });
    return NextResponse.json(status);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH — applique une durée de validité au mot de passe courant (super-admin). */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await requireSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const pool = getPool();
    const status = await withTemplateReaderLock(pool, () =>
      updateTemplateReaderValidity(
        {
          credentials: pgTemplateReaderCredentialsRepository(pool),
          provisioner: pgTemplateReaderProvisioner(pool),
          accounts: pgTemplateReaderAccountStore(pool),
        },
        session.actor.id,
        body.validityDays,
      ),
    );
    return NextResponse.json({ status });
  } catch (error) {
    return errorResponse(error);
  }
}
