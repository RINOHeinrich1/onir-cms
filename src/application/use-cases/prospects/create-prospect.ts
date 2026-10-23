import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { Prospect } from "@/domain/entities/prospect";
import { validateProspect } from "@/domain/prospect-rules";

export type CreateProspectDependencies = {
  prospects: ProspectRepository;
};

/** US-PROSPECT-001 — création d'un prospect (admin/marketeur, RM-PROSPECT-001). */
export async function createProspect(
  deps: CreateProspectDependencies,
  actor: Actor,
  input: unknown,
): Promise<Prospect> {
  assertCan(actor, "prospects:create");

  const validated = validateProspect(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.map((error) => error.message).join(" ; "));
  }

  return deps.prospects.create(organizationOf(actor), {
    ...validated.value,
    createdBy: actor.id,
    origine: "saisie",
    lienId: null,
  });
}
