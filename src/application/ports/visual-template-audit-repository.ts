export type VisualTemplateAuditEvent =
  | "upload"
  | "install"
  | "uninstall"
  | "platform_install"
  | "platform_uninstall"
  | "disable"
  | "enable"
  | "import_failed"
  | "version_test_ok"
  | "version_test_error"
  | "version_disabled"
  | "version_enabled"
  | "version_rollback"
  | "version_uninstalled"
  | "ai_edit";

export type VisualTemplateAuditInput = {
  organizationId: string | null;
  templateId: string | null;
  actorId: string | null;
  event: VisualTemplateAuditEvent;
  metadata?: Record<string, unknown>;
};

export interface VisualTemplateAuditRepository {
  record(input: VisualTemplateAuditInput): Promise<void>;
}
