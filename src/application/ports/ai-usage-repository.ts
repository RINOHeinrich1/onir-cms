import type {
  AiCluster,
  AiLinkOverride,
  AiLinkUsage,
  AiTarget,
  AiUsage,
  AiUsageDefault,
} from "@/domain/entities/ai-usage";

export type AiClusterInput = {
  label: string;
  description: string;
  actif: boolean;
  members: { providerId: string; model: string; enabled: boolean }[];
};

export interface AiUsageRepository {
  listDefaults(organizationId: string): Promise<AiUsageDefault[]>;
  setDefault(
    organizationId: string,
    usage: AiUsage,
    target: AiTarget,
    updatedBy: string | null,
  ): Promise<void>;
  clearDefault(organizationId: string, usage: AiUsage): Promise<void>;

  listLinkOverrides(organizationId: string, chatLinkId: string): Promise<AiLinkOverride[]>;
  setLinkOverride(
    organizationId: string,
    chatLinkId: string,
    usage: AiLinkUsage,
    target: AiLinkOverride["target"],
  ): Promise<void>;
  clearLinkOverride(organizationId: string, chatLinkId: string, usage: AiLinkUsage): Promise<void>;

  listClusters(organizationId: string, includeInactive?: boolean): Promise<AiCluster[]>;
  findCluster(organizationId: string, id: string): Promise<AiCluster | null>;
  createCluster(
    organizationId: string,
    input: AiClusterInput,
    createdBy: string | null,
  ): Promise<AiCluster>;
  updateCluster(
    organizationId: string,
    id: string,
    input: AiClusterInput,
  ): Promise<AiCluster | null>;
  deleteCluster(organizationId: string, id: string): Promise<boolean>;
}
