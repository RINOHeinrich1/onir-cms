export type AiGrantTarget =
  | { kind: "provider"; providerId: string }
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

export type AiGrantCatalogModel = {
  modelId: string;
  label: string;
  enabled: boolean;
};

export type AiGrantCatalogProvider = {
  id: string;
  label: string;
  organizationId: string;
  organizationName: string;
  archivedAt: string | null;
  models: AiGrantCatalogModel[];
};

export type AiGrantCatalogCluster = {
  id: string;
  label: string;
  organizationId: string;
  organizationName: string;
  actif: boolean;
  members: { providerId: string; model: string; enabled: boolean }[];
};

export type AiGrantCatalog = {
  providers: AiGrantCatalogProvider[];
  clusters: AiGrantCatalogCluster[];
};

export type AiGrantSet = {
  providers: string[];
  models: { providerId: string; model: string }[];
  clusters: string[];
};

export interface AiGrantRepository {
  listCatalog(): Promise<AiGrantCatalog>;
  listGrants(organizationId: string): Promise<AiGrantSet>;
  grant(organizationId: string, target: AiGrantTarget, grantedBy: string): Promise<void>;
  revoke(organizationId: string, target: AiGrantTarget): Promise<void>;
  countUsage(organizationId: string, target: AiGrantTarget): Promise<number>;
}
