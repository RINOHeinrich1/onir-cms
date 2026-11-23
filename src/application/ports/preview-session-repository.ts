import type { TemplateParamValues } from "@/domain/template-params";

export type PreviewSurface = "page" | "widget";

export type PreviewSession = {
  id: string;
  tokenHash: string;
  userId: string;
  organizationId: string;
  linkId: string;
  surface: PreviewSurface;
  templateId: string | null;
  templateVersion: string | null;
  params: TemplateParamValues;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePreviewSessionInput = {
  tokenHash: string;
  userId: string;
  organizationId: string;
  linkId: string;
  surface: PreviewSurface;
  templateId: string | null;
  templateVersion: string | null;
  params: TemplateParamValues;
  expiresAt: Date;
};

export type UpdatePreviewSessionInput = {
  userId: string;
  organizationId: string;
  linkId: string;
  surface: PreviewSurface;
  templateId: string | null;
  templateVersion: string | null;
  params: TemplateParamValues;
  expiresAt: Date;
};

export type PreviewSessionRepository = {
  create(input: CreatePreviewSessionInput): Promise<PreviewSession>;
  updateByToken(
    tokenHash: string,
    input: UpdatePreviewSessionInput,
  ): Promise<PreviewSession | null>;
  findByTokenHash(tokenHash: string): Promise<PreviewSession | null>;
  deleteExpired(): Promise<number>;
};
