import type { ReasoningProfile } from "@/domain/ai-capabilities";
import type { AiDialect, AiProvider, AiProviderPreset } from "@/domain/entities/ai-provider";
import type { OrganizationAiSettings } from "@/domain/entities/ai-settings";
import type { SealedAiKey } from "@/lib/ai-crypto";

export type CreateAiProviderInput = {
  label: string;
  preset: AiProviderPreset;
  dialect: AiDialect;
  baseUrl: string;
  sealedKey: SealedAiKey;
  apiKeyHint: string;
  defaultModel: string | null;
  reasoningProfile?: ReasoningProfile;
  createdBy: string | null;
};

export type UpdateAiProviderInput = {
  label?: string;
  preset?: AiProviderPreset;
  dialect?: AiDialect;
  baseUrl?: string;
  sealedKey?: SealedAiKey;
  apiKeyHint?: string;
  defaultModel?: string | null;
  reasoningProfile?: ReasoningProfile;
};

export type AiProviderTestResult = {
  ok: boolean;
  latencyMs: number;
  modelsCount: number;
  error: string;
};

/** Port de persistance des fournisseurs IA, toujours scopé organisation. */
export interface AiProviderRepository {
  list(organizationId: string, options?: { includeArchived?: boolean }): Promise<AiProvider[]>;
  findById(organizationId: string, id: string): Promise<AiProvider | null>;
  create(organizationId: string, input: CreateAiProviderInput): Promise<AiProvider>;
  update(
    organizationId: string,
    id: string,
    patch: UpdateAiProviderInput,
  ): Promise<AiProvider | null>;
  archive(organizationId: string, id: string): Promise<AiProvider | null>;
  getSealedKey(organizationId: string, id: string): Promise<SealedAiKey | null>;
  setLastTest(organizationId: string, id: string, result: AiProviderTestResult): Promise<void>;
  countLinksUsing(organizationId: string, id: string): Promise<number>;
  getOrganizationSettings(organizationId: string): Promise<OrganizationAiSettings | null>;
  setOrganizationDefault(
    organizationId: string,
    input: { providerId: string | null; model: string | null; updatedBy: string | null },
  ): Promise<OrganizationAiSettings | null>;
  setOrganizationExtraction(
    organizationId: string,
    input: {
      providerId: string | null;
      model: string | null;
      fallbackProviderId: string | null;
      fallbackModel: string | null;
      updatedBy: string | null;
    },
  ): Promise<OrganizationAiSettings | null>;
}
