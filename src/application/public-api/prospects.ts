import { NotFoundError, ValidationError } from "@/application/errors";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { prospectDto } from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";
import type { Prospect } from "@/domain/entities/prospect";
import { validateProspect } from "@/domain/prospect-rules";

export type ProspectListCriteria = {
  q: string | null;
  origine: Prospect["origine"] | null;
  chatbotId: string | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

function matches(prospect: Prospect, criteria: ProspectListCriteria): boolean {
  if (criteria.origine !== null && prospect.origine !== criteria.origine) return false;
  if (criteria.chatbotId !== null && prospect.lienId !== criteria.chatbotId) return false;
  if (criteria.q !== null) {
    const needle = criteria.q.toLowerCase();
    const haystack = [
      prospect.nom,
      prospect.prenom,
      prospect.email,
      prospect.activite,
      prospect.fonction,
      prospect.detail,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export async function listProspectsForApi(
  deps: { prospects: ProspectRepository },
  organizationId: string,
  criteria: ProspectListCriteria,
) {
  const prospects = await deps.prospects.list(organizationId, null);
  const filtered = prospects.filter((prospect) => matches(prospect, criteria));
  const page = paginateByCreatedAt(filtered, criteria.limit, criteria.cursor, criteria.sort);
  return {
    data: page.data.map(prospectDto),
    pagination: page.pagination,
  };
}

export async function getProspectForApi(
  deps: { prospects: ProspectRepository },
  organizationId: string,
  id: string,
) {
  const prospect = await deps.prospects.findById(organizationId, id);
  if (prospect === null) throw new NotFoundError("Prospect introuvable");
  return prospectDto(prospect);
}

export async function createProspectForApi(
  deps: { prospects: ProspectRepository },
  organizationId: string,
  createdBy: string | null,
  input: unknown,
) {
  const validated = validateProspect(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.map((error) => error.message).join(" ; "));
  }
  const prospect = await deps.prospects.create(organizationId, {
    ...validated.value,
    createdBy,
    origine: "saisie",
    lienId: null,
  });
  return prospectDto(prospect);
}

export async function updateProspectForApi(
  deps: { prospects: ProspectRepository },
  organizationId: string,
  id: string,
  input: unknown,
) {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const patch: Parameters<ProspectRepository["update"]>[2] = {};

  if ("nom" in source) {
    const nom = typeof source.nom === "string" ? source.nom.trim() : "";
    if (nom === "") throw new ValidationError("Le nom est obligatoire");
    patch.nom = nom;
  }
  if ("prenom" in source)
    patch.prenom = typeof source.prenom === "string" ? source.prenom.trim() : "";
  if ("nature" in source) {
    const nature = typeof source.nature === "string" ? source.nature.trim() : "";
    if (nature !== "physique" && nature !== "morale") {
      throw new ValidationError("Nature invalide (physique ou morale)");
    }
    patch.nature = nature;
  }
  if ("email" in source) {
    const email = typeof source.email === "string" ? source.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError("Adresse email invalide");
    }
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
  if (Object.keys(patch).length === 0) throw new ValidationError("Aucun champ à modifier");

  const updated = await deps.prospects.update(organizationId, id, patch);
  if (updated === null) throw new NotFoundError("Prospect introuvable");
  return prospectDto(updated);
}

export async function listProspectConversationsForApi(
  deps: {
    conversations: import("@/application/ports/conversation-repository").ConversationRepository;
  },
  organizationId: string,
  prospectId: string,
) {
  const conversations = await deps.conversations.listWithDetails(organizationId, "toutes");
  return conversations.filter((conversation) => conversation.prospectId === prospectId);
}

export async function listProspectFichesForApi(
  deps: { fiches: import("@/application/ports/fiche-repository").FicheRepository },
  organizationId: string,
  prospectId: string,
) {
  const fiches = await deps.fiches.list(organizationId, "toutes");
  return fiches.filter((fiche) => fiche.prospectId === prospectId);
}
