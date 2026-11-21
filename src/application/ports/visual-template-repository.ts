import type {
  TemplateManifest,
  TemplateMode,
  TemplateTrustLevel,
  TemplateVersionHealth,
} from "@/domain/entities/visual-template";

export type VisualTemplate = {
  id: string;
  key: string;
  name: string;
  description: string;
  author: string;
  ownerOrganizationId: string | null;
  uploadedBy: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  disabledReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InstallationSource =
  | "legacy"
  | "platform_default"
  | "platform_admin"
  | "organization_upload"
  | "organization_admin";

export type VisualTemplateInstallation = {
  organizationId: string;
  templateId: string;
  installedBy: string | null;
  installedAt: string;
  source: InstallationSource;
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
  healthStatus: TemplateVersionHealth;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorDetail: Record<string, unknown> | null;
  disabledAt: string | null;
  disabledBy: string | null;
  disabledReason: string | null;
  createdAt: string;
};

export type VisualTemplateVersionUsage = {
  links: number;
  bindings: number;
  assets: number;
};

export type VisualTemplateVersionDeletion = {
  deleted: boolean;
  assetKeys: string[];
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
  ownerOrganizationId?: string | null;
  uploadedBy?: string | null;
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
  /** Templates installés dans une organisation (ADR-0025 §6 / ADR-0091). */
  listForOrganization(organizationId: string): Promise<VisualTemplate[]>;
  /** Catalogue plateforme non installé, visible par toutes les organisations. */
  listAvailableForOrganization(organizationId: string): Promise<VisualTemplate[]>;
  /** Templates privés de l'organisation. */
  listOwnedByOrganization(organizationId: string): Promise<VisualTemplate[]>;
  /** Template visible par une organisation (plateforme ou privé à l'org). */
  findByIdForOrganization(
    organizationId: string,
    id: string,
    includeDisabled?: boolean,
  ): Promise<VisualTemplate | null>;
  /** Template installé dans l'organisation. */
  findAssignedById(organizationId: string, id: string): Promise<VisualTemplate | null>;
  /** Template plateforme par clé (starter, etc.). */
  findPlatformByKey(key: string): Promise<VisualTemplate | null>;
  /** Template privé d'une organisation par clé. */
  findByKeyForOrganization(organizationId: string, key: string): Promise<VisualTemplate | null>;
  findInstallation(
    organizationId: string,
    templateId: string,
  ): Promise<VisualTemplateInstallation | null>;
  countOwnedByOrganization(organizationId: string): Promise<number>;
  countLinkUsages(organizationId: string, templateId: string): Promise<number>;
  /** Tous les identifiants du catalogue plateforme (assignation en masse). */
  listAllPlatformIds(): Promise<string[]>;
  assignAllToOrganization(organizationId: string, source?: InstallationSource): Promise<void>;
  assignToAllOrganizations(templateId: string, source?: InstallationSource): Promise<void>;
  install(
    organizationId: string,
    templateId: string,
    actorId: string | null,
    source: InstallationSource,
  ): Promise<VisualTemplateInstallation>;
  /** Retourne true si l'installation a été retirée. */
  uninstall(organizationId: string, templateId: string): Promise<boolean>;
  findById(id: string): Promise<VisualTemplate | null>;
  findByKey(key: string): Promise<VisualTemplate | null>;
  listVersions(templateId: string): Promise<VisualTemplateVersion[]>;
  findVersion(templateId: string, version: string): Promise<VisualTemplateVersion | null>;
  findVersionForOrganization(
    organizationId: string,
    templateId: string,
    version: string,
  ): Promise<VisualTemplateVersion | null>;
  getVersionUsage(templateId: string, version: string): Promise<VisualTemplateVersionUsage>;
  setVersionDisabled(
    templateId: string,
    version: string,
    disabled: boolean,
    actorId: string | null,
    reason: string | null,
  ): Promise<VisualTemplateVersion | null>;
  deleteVersion(templateId: string, version: string): Promise<VisualTemplateVersionDeletion>;
  findAsset(versionId: string, path: string): Promise<VisualTemplateAsset | null>;
  createTemplate(input: CreateVisualTemplateInput): Promise<VisualTemplate>;
  createVersion(input: CreateVisualTemplateVersionInput): Promise<VisualTemplateVersion>;
  addAsset(input: CreateVisualTemplateAssetInput): Promise<VisualTemplateAsset>;
  setDisabled(
    id: string,
    disabled: boolean,
    actorId: string | null,
    reason: string | null,
  ): Promise<VisualTemplate | null>;
  deleteTemplate(id: string): Promise<boolean>;
}
