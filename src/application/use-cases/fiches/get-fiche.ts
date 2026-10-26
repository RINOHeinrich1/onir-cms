import { NotFoundError } from "@/application/errors";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { Fiche } from "@/domain/entities/fiche";

export async function getFicheForOrganization(
  deps: { fiches: FicheRepository },
  organizationId: string,
  id: string,
): Promise<Fiche> {
  const fiche = await deps.fiches.findById(organizationId, id);
  if (fiche === null) throw new NotFoundError("Fiche introuvable");
  return fiche;
}
