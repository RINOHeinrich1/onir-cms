import type {
  TemplateManifest,
  TemplateMode,
  TemplateTrustLevel,
} from "@/domain/entities/visual-template";

export type VisualTemplate = {
  id: string;
  key: string;
  name: string;
  description: string;
  author: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisualTemplateVersion = {
  id: string;
  templateId: string;
  version: string;
  hostProtocol: string;
  trustLevel: TemplateTrustLevel;
  mode: TemplateMode;
  manifest: TemplateManifest;
  entry: string;
  integrity: string;
  createdAt: string;
};

export type VisualTemplateAsset = {
  id: string;
  versionId: string;
  path: string;
  storageKey: string;
  sha256: string;
  size: number;
  mime: string;
};

export type CreateVisualTemplateInput = {
  key: string;
  name: string;
  description: string;
  author: string;
  createdBy: string | null;
};

export type CreateVisualTemplateVersionInput = {
  templateId: string;
  version: string;
  hostProtocol: string;
  trustLevel: TemplateTrustLevel;
  mode: TemplateMode;
  manifest: TemplateManifest;
  entry: string;
  integrity: string;
  createdBy: string | null;
};

export type CreateVisualTemplateAssetInput = {
  versionId: string;
  path: string;
  storageKey: string;
  sha256: string;
  size: number;
  mime: string;
};

export interface VisualTemplateRepository {
  /** Catalogue global (super-admin). */
  list(): Promise<VisualTemplate[]>;
  /** Templates assignés à une organisation (ADR-0025 §6). */
  listForOrganization(organizationId: string): Promise<VisualTemplate[]>;
  /** Template du catalogue, uniquement s'il est assigné à l'organisation. */
  findAssignedById(organizationId: string, id: string): Promise<VisualTemplate | null>;
  /** Tous les identifiants du catalogue (assignation en masse). */
  listAllIds(): Promise<string[]>;
  assignAllToOrganization(organizationId: string): Promise<void>;
  assignToAllOrganizations(templateId: string): Promise<void>;
  unassign(organizationId: string, templateId: string): Promise<void>;
  findById(id: string): Promise<VisualTemplate | null>;
  findByKey(key: string): Promise<VisualTemplate | null>;
  listVersions(templateId: string): Promise<VisualTemplateVersion[]>;
  findVersion(templateId: string, version: string): Promise<VisualTemplateVersion | null>;
  findAsset(versionId: string, path: string): Promise<VisualTemplateAsset | null>;
  createTemplate(input: CreateVisualTemplateInput): Promise<VisualTemplate>;
  createVersion(input: CreateVisualTemplateVersionInput): Promise<VisualTemplateVersion>;
  addAsset(input: CreateVisualTemplateAssetInput): Promise<VisualTemplateAsset>;
  deleteTemplate(id: string): Promise<boolean>;
}
