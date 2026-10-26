export type ApiKeyAuditEvent = "created" | "revoked" | "auth_failed";

export interface ApiKeyAuditRepository {
  record(input: {
    apiKeyId: string;
    organizationId: string;
    event: ApiKeyAuditEvent;
    ip: string | null;
    userAgent: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
