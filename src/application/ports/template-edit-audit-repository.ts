export type TemplateEditAuditEvent =
  | "session_started"
  | "session_resumed"
  | "user_message"
  | "assistant_message"
  | "skill_routing"
  | "target_candidates"
  | "proposal_created"
  | "proposal_rejected"
  | "proposal_applied"
  | "link_saved"
  | "ambiguous"
  | "not_found"
  | "error";

export type TemplateEditAuditInput = {
  organizationId: string;
  linkId: string;
  sessionId: string;
  messageId?: string | null;
  turnId?: string | null;
  actorId: string | null;
  event: TemplateEditAuditEvent;
  stage?: string | null;
  templateId?: string | null;
  templateVersion?: string | null;
  candidateId?: string | null;
  content?: string | null;
  operations?: unknown;
  warnings?: string[];
  beforeHash?: string | null;
  afterHash?: string | null;
  rawResponse?: unknown;
  validationErrors?: string[] | null;
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
