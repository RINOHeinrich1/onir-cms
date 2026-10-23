import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ProspectRepository } from "@/application/ports/prospect-repository";

export type DeleteProspectDependencies = {
  prospects: ProspectRepository;
};

/** US-PROSPECT-001 — suppression d'un prospect (admin/marketeur). */
export async function deleteProspect(
  deps: DeleteProspectDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "prospects:delete");

  const deleted = await deps.prospects.delete(organizationOf(actor), id);
  if (!deleted) {
    throw new NotFoundError("Prospect introuvable");
  }
}
