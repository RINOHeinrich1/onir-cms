export type TemplateEditAuditEvent =
  | "session_started"
  | "session_resumed"
  | "user_message"
  | "assistant_message"
  | "proposal_created"
  | "proposal_applied"
  | "link_saved"
  | "ambiguous"
  | "not_found";

export type TemplateEditAuditInput = {
  organizationId: string;
  linkId: string;
  sessionId: string;
  messageId?: string | null;
  actorId: string | null;
  event: TemplateEditAuditEvent;
  templateId?: string | null;
  templateVersion?: string | null;
  candidateId?: string | null;
  content?: string | null;
  operations?: unknown;
  warnings?: string[];
  beforeHash?: string | null;
  afterHash?: string | null;
  metadata?: Record<string, unknown>;
};

export type TemplateEditAuditRecord = TemplateEditAuditInput & {
  id: string;
  createdAt: string;
};

export interface TemplateEditAuditRepository {
  record(input: TemplateEditAuditInput): Promise<void>;
  listBySession(
    organizationId: string,
    linkId: string,
    sessionId: string,
  ): Promise<TemplateEditAuditRecord[]>;
}
