import type { TemplateEditSession, TemplateEditSessionState } from "@/domain/template-edit-session";

export type CreateTemplateEditSessionInput = {
  organizationId: string;
  linkId: string;
  createdBy: string | null;
  surface: "page" | "widget";
  templateId: string | null;
  templateVersion: string | null;
  state: TemplateEditSessionState;
};

export interface TemplateEditSessionRepository {
  create(input: CreateTemplateEditSessionInput): Promise<TemplateEditSession>;
  find(
    organizationId: string,
    linkId: string,
    sessionId: string,
  ): Promise<TemplateEditSession | null>;
  findActive(
    organizationId: string,
    linkId: string,
    surface: "page" | "widget",
    createdBy: string,
  ): Promise<TemplateEditSession | null>;
  save(
    organizationId: string,
    linkId: string,
    sessionId: string,
    state: TemplateEditSessionState,
  ): Promise<TemplateEditSession | null>;
  archive(organizationId: string, linkId: string, sessionId: string): Promise<boolean>;
}
