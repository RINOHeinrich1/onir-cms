import type { ReasoningMode } from "@/domain/ai-capabilities";
import type { AiModelSource, AiProviderModel } from "@/domain/entities/ai-model";

export type CreateAiProviderModelInput = {
  modelId: string;
  label?: string;
  source: AiModelSource;
  enabled?: boolean;
  createdBy: string | null;
};

/** Port de persistance des modèles d'un fournisseur, scopé organisation. */
export interface AiProviderModelRepository {
  list(
    organizationId: string,
    providerId: string,
    options?: { enabledOnly?: boolean },
  ): Promise<AiProviderModel[]>;
  findById(organizationId: string, providerId: string, id: string): Promise<AiProviderModel | null>;
  findByModelId(
    organizationId: string,
    providerId: string,
    modelId: string,
  ): Promise<AiProviderModel | null>;
  create(
    organizationId: string,
    providerId: string,
    input: CreateAiProviderModelInput,
  ): Promise<AiProviderModel>;
  syncCatalog(
    organizationId: string,
    providerId: string,
    modelIds: string[],
  ): Promise<AiProviderModel[]>;
  setEnabled(
    organizationId: string,
    providerId: string,
    id: string,
    enabled: boolean,
  ): Promise<AiProviderModel | null>;
  setReasoningMode(
    organizationId: string,
    providerId: string,
    id: string,
    reasoningMode: ReasoningMode,
  ): Promise<AiProviderModel | null>;
  remove(organizationId: string, providerId: string, id: string): Promise<boolean>;
  countLinksUsing(organizationId: string, providerId: string, modelId: string): Promise<number>;
}
