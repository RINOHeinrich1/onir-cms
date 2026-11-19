export type VisualTemplateAuditEvent =
  | "upload"
  | "install"
  | "uninstall"
  | "platform_install"
  | "platform_uninstall"
  | "disable"
  | "enable";

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
