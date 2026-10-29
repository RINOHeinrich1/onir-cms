import { NotFoundError } from "@/application/errors";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import { connaissanceDto } from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";
import type { PublicApiPrincipal } from "@/application/public-api/principal";
import { readActor } from "@/application/public-api/principal";
import {
  createConnaissance,
  deleteConnaissance,
  updateConnaissance,
} from "@/application/use-cases/connaissances/manage-connaissances";
import type { Connaissance } from "@/domain/entities/connaissance";

export type ConnaissanceListCriteria = {
  q: string | null;
  active: boolean | null;
  chatbotId: string | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

export function actorForApi(principal: PublicApiPrincipal) {
  return { ...readActor(principal), id: principal.createdBy ?? principal.apiKeyId };
}

function matches(connaissance: Connaissance, criteria: ConnaissanceListCriteria): boolean {
  if (criteria.active !== null && connaissance.actif !== criteria.active) return false;
  if (criteria.chatbotId !== null && !connaissance.chatLinkIds.includes(criteria.chatbotId)) {
    return false;
  }
  if (criteria.q !== null) {
    const needle = criteria.q.toLowerCase();
    if (!`${connaissance.titre} ${connaissance.contenu}`.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}

export async function listConnaissancesForApi(
  deps: { connaissances: ConnaissanceRepository },
  organizationId: string,
  criteria: ConnaissanceListCriteria,
) {
  const rows = await deps.connaissances.list(organizationId);
  const page = paginateByCreatedAt(
    rows.filter((row) => matches(row, criteria)),
    criteria.limit,
    criteria.cursor,
    criteria.sort,
  );
  return {
    data: page.data.map(connaissanceDto),
    pagination: page.pagination,
  };
}

export async function getConnaissanceForApi(
  deps: { connaissances: ConnaissanceRepository },
  organizationId: string,
  id: string,
) {
  const row = await deps.connaissances.findById(organizationId, id);
  if (row === null) throw new NotFoundError("Connaissance introuvable");
  return connaissanceDto(row);
}

export async function createConnaissanceForApi(
  deps: { connaissances: ConnaissanceRepository },
  principal: PublicApiPrincipal,
  input: unknown,
) {
  const row = await createConnaissance(deps, actorForApi(principal), input);
  return connaissanceDto(row);
}

export async function updateConnaissanceForApi(
  deps: { connaissances: ConnaissanceRepository },
  principal: PublicApiPrincipal,
  id: string,
  input: unknown,
) {
  const row = await updateConnaissance(deps, actorForApi(principal), id, input);
  return connaissanceDto(row);
}

export async function deleteConnaissanceForApi(
  deps: { connaissances: ConnaissanceRepository },
  principal: PublicApiPrincipal,
  id: string,
): Promise<void> {
  await deleteConnaissance(deps, actorForApi(principal), id);
}
