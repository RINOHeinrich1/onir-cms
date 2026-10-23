import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";

export type LinkAiAssignment = {
  aiProviderId: string | null;
  aiModel: string | null;
};

export type LinkAiAssignmentDependencies = {
  aiProviders?: AiProviderRepository;
  aiModels?: AiProviderModelRepository;
};

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Normalise les champs IA d'un lien.
 * - create (existing=null) : absents ⇒ héritage (null/null) ;
 * - update (existing fourni) : absents ⇒ null (aucun changement).
 * Les deux champs doivent toujours être fournis ensemble.
 */
export function parseAiAssignmentInput(
  source: Record<string, unknown>,
  existing: Pick<LinkAiAssignment, "aiProviderId" | "aiModel"> | null = null,
): LinkAiAssignment | null {
  const hasProvider = "aiProviderId" in source;
  const hasModel = "aiModel" in source;
  if (!hasProvider && !hasModel) {
    return existing === null ? { aiProviderId: null, aiModel: null } : null;
  }
  if (hasProvider !== hasModel) {
    throw new ValidationError("Fournisseur et modèle IA doivent être fournis ensemble");
  }

  const aiProviderId = textOrNull(source.aiProviderId);
  const aiModel = textOrNull(source.aiModel);
  if (aiProviderId === null && aiModel === null) {
    return { aiProviderId: null, aiModel: null };
  }
  if (aiProviderId === null || aiModel === null) {
    throw new ValidationError("Fournisseur et modèle IA doivent être renseignés ensemble");
  }
  if (aiModel.length > 200) {
    throw new ValidationError("Identifiant de modèle trop long (200 max)");
  }
  return { aiProviderId, aiModel };
}

/** Vérifie que le fournisseur appartient à l'organisation et que le modèle est actif. */
export async function assertAssignableProvider(
  deps: LinkAiAssignmentDependencies,
  organizationId: string,
  assignment: LinkAiAssignment,
): Promise<void> {
  if (assignment.aiProviderId === null || assignment.aiModel === null) return;
  if (deps.aiProviders === undefined) {
    throw new ValidationError("Gestion des fournisseurs IA indisponible");
  }
  const provider = await deps.aiProviders.findById(organizationId, assignment.aiProviderId);
  if (provider === null || provider.archivedAt !== null) {
    throw new NotFoundError("Fournisseur IA introuvable ou archivé");
  }
  if (deps.aiModels !== undefined) {
    const model = await deps.aiModels.findByModelId(
      organizationId,
      assignment.aiProviderId,
      assignment.aiModel,
    );
    if (model === null || !model.enabled) {
      throw new ValidationError("Le modèle sélectionné n'est pas actif pour ce fournisseur");
    }
  }
}
