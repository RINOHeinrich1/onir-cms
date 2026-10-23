import type {
  ChatTemplate,
  ChatTemplateVersion,
  TemplateDefinition,
} from "@/domain/entities/chat-template";

export interface ChatTemplateRepository {
  list(organizationId: string): Promise<ChatTemplate[]>;
  findByKey(organizationId: string, key: string): Promise<ChatTemplate | null>;
  findVersion(
    organizationId: string,
    key: string,
    version: number,
  ): Promise<ChatTemplateVersion | null>;
  currentVersion(organizationId: string, key: string): Promise<ChatTemplateVersion | null>;
  createTemplate(
    organizationId: string,
    input: TemplateDefinition,
    createdBy: string | null,
  ): Promise<ChatTemplateVersion>;
  addVersion(
    organizationId: string,
    key: string,
    definition: TemplateDefinition,
    createdBy: string | null,
  ): Promise<ChatTemplateVersion>;
  deleteTemplate(organizationId: string, key: string): Promise<boolean>;
  /** Clés référencées par au moins un lien (garde de suppression). */
  listKeysReferencedByLinks(organizationId: string): Promise<string[]>;
  /** Clés référencées par au moins une fiche (garde de suppression). */
  listKeysReferencedByFiches(organizationId: string): Promise<string[]>;
}
