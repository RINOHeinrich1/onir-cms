/**
 * Ressources de données des templates (ADR-0026) — types partagés côté hôte.
 * Aucun nom métier : uniquement contrats, bindings, résultats et erreurs.
 */

export const TEMPLATE_DATA_ERROR_CODES = [
  "DATA_UNBOUND",
  "DATA_DISABLED",
  "DATA_INPUT_INVALID",
  "DATA_TIMEOUT",
  "DATA_LIMIT",
  "DATA_PROVIDER_ERROR",
  "DATA_CONTRACT_INVALID",
  "DATA_UNAUTHORIZED",
] as const;

export type TemplateDataErrorCode = (typeof TEMPLATE_DATA_ERROR_CODES)[number];

export type TemplateDataMeta = {
  cached: boolean;
  generatedAt: string;
  revision: number;
  truncated: boolean;
};

export type TemplateDataResult<T = unknown> =
  | { status: "ok"; data: T; meta: TemplateDataMeta }
  | {
      status: "error";
      code: TemplateDataErrorCode;
      message: string;
      fieldErrors?: { path: string; message: string }[];
    };

export type TemplateDataChildQuery = {
  path: string;
  queryText: string;
  foreignKey: string;
};

export type TemplateDataQueryInput = {
  index: number;
  from: string;
};

export type TemplateDataInvalidation = "none" | "medias" | "connaissances" | "prospects";

export type TemplateDataBinding = {
  id: string;
  name: string;
  isDefault: boolean;
  organizationId: string;
  templateVersionId: string;
  contractKey: string;
  provider: "sql";
  queryText: string;
  rootPath: string;
  rootKey: string;
  children: TemplateDataChildQuery[];
  queryInputs: TemplateDataQueryInput[];
  invalidateOn: TemplateDataInvalidation;
  cacheTtlSeconds: number;
  maxRows: number;
  enabled: boolean;
  revision: number;
};
