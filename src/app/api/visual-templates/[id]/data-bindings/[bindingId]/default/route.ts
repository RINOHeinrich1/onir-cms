import { NextResponse } from "next/server";
import { ForbiddenError, ValidationError } from "@/application/errors";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { errorResponse } from "../../../../../_lib/errors";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; bindingId: string }> };

/** POST — définit ce binding comme défaut du contrat (l'ancien devient variante). */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { bindingId } = await context.params;
    const binding = await pgTemplateDataBindingRepository(getPool()).setDefault(
      actor.organizationId,
      bindingId,
    );
    if (binding === null) throw new ValidationError("Binding introuvable");
    return NextResponse.json({ binding });
  } catch (error) {
    return errorResponse(error);
  }
}
