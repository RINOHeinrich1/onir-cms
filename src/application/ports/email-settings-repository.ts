import type {
  EmailSettingsInput,
  EmailSettingsSource,
  StoredEmailSettings,
} from "@/domain/entities/email-settings";

export interface EmailSettingsRepository {
  findOrganization(organizationId: string): Promise<StoredEmailSettings | null>;
  findPlatform(): Promise<StoredEmailSettings | null>;
  upsertOrganization(
    organizationId: string,
    input: EmailSettingsInput,
    actorId: string,
  ): Promise<StoredEmailSettings>;
  upsertPlatform(input: EmailSettingsInput, actorId: string): Promise<StoredEmailSettings>;
  recordTest(organizationId: string | null, ok: boolean, error: string | null): Promise<void>;
  sourceLabel?(source: EmailSettingsSource): string;
}
