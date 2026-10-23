import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type {
  ProspectRepository,
  UpdateProspectInput,
} from "@/application/ports/prospect-repository";
import { isNatureProspect, type NatureProspect, type Prospect } from "@/domain/entities/prospect";
import { EMAIL_PATTERN } from "@/domain/prospect-rules";

export type UpdateProspectDependencies = {
  prospects: ProspectRepository;
};

/** US-PROSPECT-001 — modification partielle d'un prospect (admin/marketeur). */
export async function updateProspect(
  deps: UpdateProspectDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<Prospect> {
  assertCan(actor, "prospects:update");

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const patch: UpdateProspectInput = {};

  if ("nom" in source) {
    const nom = typeof source.nom === "string" ? source.nom.trim() : "";
    if (nom === "") throw new ValidationError("Le nom est obligatoire");
    patch.nom = nom;
  }
  if ("prenom" in source) {
    patch.prenom = typeof source.prenom === "string" ? source.prenom.trim() : "";
  }
  if ("nature" in source) {
    const nature: string = typeof source.nature === "string" ? source.nature.trim() : "";
    if (!isNatureProspect(nature)) {
      throw new ValidationError("Nature invalide (physique ou morale)");
    }
    const value: NatureProspect = nature;
    patch.nature = value;
  }
  if ("email" in source) {
    const email = typeof source.email === "string" ? source.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError("Adresse email invalide");
    patch.email = email;
  }
  if ("activite" in source) {
    patch.activite = typeof source.activite === "string" ? source.activite.trim() : "";
  }
  if ("fonction" in source) {
    patch.fonction = typeof source.fonction === "string" ? source.fonction.trim() : "";
  }
  if ("detail" in source) {
    patch.detail = typeof source.detail === "string" ? source.detail.trim() : "";
  }

  const updated = await deps.prospects.update(organizationOf(actor), id, patch);
  if (updated === null) {
    throw new NotFoundError("Prospect introuvable");
  }
  return updated;
}
