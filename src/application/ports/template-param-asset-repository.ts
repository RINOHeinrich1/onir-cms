export type TemplateParamAsset = {
  id: string;
  organizationId: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
};

export type CreateTemplateParamAssetInput = {
  storageKey: string;
  mime: string;
  sizeBytes: number;
  createdBy: string | null;
};

export interface TemplateParamAssetRepository {
  create(organizationId: string, input: CreateTemplateParamAssetInput): Promise<TemplateParamAsset>;
  findByIdPublic(id: string): Promise<TemplateParamAsset | null>;
  delete(organizationId: string, id: string): Promise<TemplateParamAsset | null>;
}
