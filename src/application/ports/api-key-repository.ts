import type { ApiKey, ApiKeyScope, ApiKeyWithHash } from "@/domain/entities/api-key";

export type CreateApiKeyRecordInput = {
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  createdBy: string;
  expiresAt: string | null;
};

export interface ApiKeyRepository {
  list(organizationId: string): Promise<ApiKey[]>;
  create(organizationId: string, input: CreateApiKeyRecordInput): Promise<ApiKey>;
  revoke(organizationId: string, id: string): Promise<ApiKey | null>;
  findByPrefix(keyPrefix: string): Promise<ApiKeyWithHash | null>;
  touchLastUsed(id: string, ip: string | null): Promise<void>;
}
