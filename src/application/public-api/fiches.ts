import { NotFoundError } from "@/application/errors";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import { ficheDto } from "@/application/public-api/dto";

export async function setFicheArchiveForApi(
  deps: { fiches: FicheRepository },
  organizationId: string,
  id: string,
  archived: boolean,
) {
  const fiche = await deps.fiches.setArchivee(organizationId, id, archived);
  if (fiche === null) throw new NotFoundError("Fiche introuvable");
  return ficheDto(fiche);
}
