import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { Prospect, ProspectOriginFilter } from "@/domain/entities/prospect";

export type ListProspectsDependencies = {
  prospects: ProspectRepository;
};

/** US-PROSPECT-001 — liste des prospects (tous les rôles en lecture). */
export async function listProspects(
  deps: ListProspectsDependencies,
  actor: Actor,
  filter: ProspectOriginFilter | ProspectOriginFilter[] | null = null,
): Promise<Prospect[]> {
  assertCan(actor, "prospects:list");
  return deps.prospects.list(organizationOf(actor), filter);
}

/** Libellés des liens ayant au moins un prospect (options du filtre d'origine). */
export async function listProspectLinkLabels(
  deps: ListProspectsDependencies,
  actor: Actor,
): Promise<string[]> {
  assertCan(actor, "prospects:list");
  return deps.prospects.listLinkLabels(organizationOf(actor));
}
