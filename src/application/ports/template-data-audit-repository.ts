import type { TemplateDataErrorCode } from "@/domain/template-data";

export type TemplateDataAuditEntry = {
  organizationId: string;
  linkId: string | null;
  templateVersionId: string;
  contractKey: string;
  bindingId: string | null;
  cacheHit: boolean;
  durationMs: number;
  rowCount: number | null;
  byteCount: number | null;
  outcome: "ok" | "error" | "timeout" | "invalid";
  errorCode: TemplateDataErrorCode | null;
};

export interface TemplateDataAuditRepository {
  record(entry: TemplateDataAuditEntry): Promise<void>;
}
