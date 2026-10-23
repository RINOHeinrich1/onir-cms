/**
 * Port du fournisseur de données des templates (ADR-0026 §4).
 * L'implémentation SQL exécute une requête en lecture seule dans le schéma
 * `template_read`, bornée en durée, en lignes et en volume.
 */

export type TemplateQueryInput = {
  /** Requête `SELECT`/`WITH` sans point-virgule (une seule instruction). */
  sql: string;
  /** Valeurs positionnelles `$1..$n` issues des entrées déclarées. */
  params?: readonly unknown[];
  /** Organisation courante — jamais fournie par le visiteur. */
  organizationId: string;
  maxRows?: number;
  timeoutMs?: number;
  maxBytes?: number;
};

export type TemplateQueryResult = {
  rows: Record<string, unknown>[];
  truncated: boolean;
  durationMs: number;
  byteCount: number;
};

export type TemplateQueryErrorCode =
  | "DATA_TIMEOUT"
  | "DATA_LIMIT"
  | "DATA_UNAUTHORIZED"
  | "DATA_INPUT_INVALID"
  | "DATA_PROVIDER_ERROR";

export class TemplateQueryError extends Error {
  readonly code: TemplateQueryErrorCode;
  /** Message technique sûr (colonne/table inconnue), réservé à l'aperçu panneau. */
  readonly detail: string | undefined;

  constructor(code: TemplateQueryErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "TemplateQueryError";
    this.code = code;
    this.detail = detail;
  }
}

export interface TemplateQueryExecutor {
  execute(input: TemplateQueryInput): Promise<TemplateQueryResult>;
}
