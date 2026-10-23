/**
 * Chargement d'une ressource de données de template (ADR-0026 §5-§8).
 *
 * Résout le binding effectif (surcharge du lien > version), mappe les entrées,
 * exécute la requête racine + les enfants en batch, assemble le document,
 * valide contre le contrat, met en cache et audit — sans exposer SQL ni erreur
 * d'infrastructure au template.
 */
import type { TemplateDataAuditRepository } from "@/application/ports/template-data-audit-repository";
import type { TemplateDataBindingRepository } from "@/application/ports/template-data-binding-repository";
import {
  TemplateQueryError,
  type TemplateQueryExecutor,
} from "@/application/ports/template-query-executor";
import type { TemplateDataContract } from "@/domain/data-contracts";
import { validateDataValue } from "@/domain/data-contracts";
import type { ChatLink } from "@/domain/entities/chat";
import type { TemplateSpec } from "@/domain/template-contract";
import type {
  TemplateDataBinding,
  TemplateDataErrorCode,
  TemplateDataResult,
} from "@/domain/template-data";
import { resolveTemplateParams } from "@/domain/template-params";
import {
  readTemplateDataCache,
  templateDataCacheKey,
  writeTemplateDataCache,
} from "@/lib/template-data-cache";

export type TemplateDataDependencies = {
  bindings: TemplateDataBindingRepository;
  executor: TemplateQueryExecutor;
  audit?: TemplateDataAuditRepository;
};

export type LoadTemplateDataInput = {
  link: ChatLink;
  spec: TemplateSpec;
  contractKey: string;
  inputs?: unknown;
  /** Aperçu : ignore `enabled` et le cache (aucune écriture de cache). */
  preview?: boolean;
  /** Aperçu : ne journalise pas dans l'audit. */
  skipAudit?: boolean;
  /** Aperçu : binding précis (variante) au lieu du binding effectif du lien. */
  binding?: TemplateDataBinding;
};

type InputValues = Record<string, string | number | boolean>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateInputs(
  contract: TemplateDataContract,
  raw: unknown,
): { ok: true; value: InputValues } | { ok: false; message: string } {
  if (raw !== undefined && !isPlainObject(raw)) return { ok: false, message: "Entrées invalides" };
  const source = isPlainObject(raw) ? raw : {};
  const declared = new Map(contract.inputs.map((input) => [input.key, input]));
  const value: InputValues = {};
  for (const [key, entry] of Object.entries(source)) {
    const declaration = declared.get(key);
    if (!declaration) return { ok: false, message: `Entrée inconnue : ${key}` };
    if (entry === null || entry === undefined)
      return { ok: false, message: `Entrée vide : ${key}` };
    const valid =
      declaration.type === "string"
        ? typeof entry === "string"
        : declaration.type === "boolean"
          ? typeof entry === "boolean"
          : declaration.type === "integer"
            ? typeof entry === "number" && Number.isInteger(entry)
            : typeof entry === "number" && Number.isFinite(entry);
    if (!valid) return { ok: false, message: `Entrée invalide : ${key}` };
    value[key] = entry as string | number | boolean;
  }
  for (const declaration of contract.inputs) {
    if (declaration.required && value[declaration.key] === undefined) {
      return { ok: false, message: `Entrée requise : ${declaration.key}` };
    }
  }
  return { ok: true, value };
}

function resolveQueryParams(
  binding: TemplateDataBinding,
  context: { inputs: InputValues; linkParams: InputValues; locale: string },
): { ok: true; value: unknown[] } | { ok: false; message: string } {
  if (binding.queryInputs.length === 0) return { ok: true, value: [] };
  const indexes = binding.queryInputs.map((entry) => entry.index).sort((a, b) => a - b);
  const expected = Array.from({ length: binding.queryInputs.length }, (_, index) => index + 1);
  if (indexes.some((value, index) => value !== expected[index])) {
    return { ok: false, message: "Mapping des paramètres incohérent" };
  }
  const params: unknown[] = new Array(binding.queryInputs.length);
  for (const entry of binding.queryInputs) {
    const [kind, key] = entry.from.split(":", 2);
    if (kind === "input" && key !== undefined) {
      params[entry.index - 1] = context.inputs[key];
    } else if (kind === "link" && key !== undefined) {
      params[entry.index - 1] = context.linkParams[key];
    } else if (kind === "system" && key === "locale") {
      params[entry.index - 1] = context.locale;
    } else {
      return { ok: false, message: `Source de paramètre inconnue : ${entry.from}` };
    }
  }
  return { ok: true, value: params };
}

function auditOutcome(code: string | null): "ok" | "error" | "timeout" | "invalid" {
  if (code === null) return "ok";
  if (code === "DATA_TIMEOUT") return "timeout";
  if (code === "DATA_CONTRACT_INVALID") return "invalid";
  return "error";
}

export async function loadTemplateData(
  deps: TemplateDataDependencies,
  input: LoadTemplateDataInput,
): Promise<TemplateDataResult> {
  const started = performance.now();
  const { link, spec, contractKey } = input;

  async function record(
    binding: TemplateDataBinding | null,
    cacheHit: boolean,
    outcome: "ok" | "error" | "timeout" | "invalid",
    errorCode: TemplateDataErrorCode | null,
    rowCount: number | null,
    byteCount: number | null,
  ): Promise<void> {
    if (!deps.audit || input.skipAudit === true) return;
    try {
      await deps.audit.record({
        organizationId: link.organizationId,
        linkId: link.id,
        templateVersionId: spec.versionId,
        contractKey,
        bindingId: binding?.id ?? null,
        cacheHit,
        durationMs: Math.round(performance.now() - started),
        rowCount,
        byteCount,
        outcome,
        errorCode,
      });
    } catch {
      // L'audit ne doit jamais casser le chargement.
    }
  }

  const contract = spec.dataContracts.find((entry) => entry.key === contractKey);
  if (contract === undefined) {
    await record(null, false, "error", "DATA_UNBOUND", null, null);
    return {
      status: "error",
      code: "DATA_UNBOUND",
      message: "Ressource non déclarée par ce template",
    };
  }

  const inputs = validateInputs(contract, input.inputs);
  if (!inputs.ok) {
    await record(null, false, "error", "DATA_INPUT_INVALID", null, null);
    return { status: "error", code: "DATA_INPUT_INVALID", message: inputs.message };
  }

  const binding =
    input.binding ??
    (await deps.bindings.findEffective({
      organizationId: link.organizationId,
      templateVersionId: spec.versionId,
      linkId: link.id,
      contractKey,
    }));
  if (binding === null) {
    await record(null, false, "error", "DATA_UNBOUND", null, null);
    return {
      status: "error",
      code: "DATA_UNBOUND",
      message: "Aucune source de données liée à cette ressource",
    };
  }
  if (!binding.enabled && input.preview !== true) {
    await record(binding, false, "error", "DATA_DISABLED", null, null);
    return { status: "error", code: "DATA_DISABLED", message: "Source de données désactivée" };
  }

  const cacheKey = templateDataCacheKey({
    organizationId: link.organizationId,
    bindingId: binding.id,
    revision: binding.revision,
    contractKey,
    inputs: inputs.value,
  });
  const cached = input.preview === true ? null : readTemplateDataCache(cacheKey);
  if (cached !== null) {
    await record(binding, true, "ok", null, null, null);
    return { status: "ok", data: cached.data, meta: { ...cached.meta, cached: true } };
  }

  const linkParams: InputValues = {};
  const resolved = resolveTemplateParams(spec.params, link.visualTemplateParams);
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      linkParams[key] = value;
    }
  }
  const params = resolveQueryParams(binding, { inputs: inputs.value, linkParams, locale: "fr" });
  if (!params.ok) {
    await record(binding, false, "error", "DATA_INPUT_INVALID", null, null);
    return { status: "error", code: "DATA_INPUT_INVALID", message: params.message };
  }

  const childrenValid = binding.children.every(
    (child) => child.path !== "" && child.queryText !== "" && child.foreignKey !== "",
  );
  if (
    !childrenValid ||
    binding.rootPath === "" ||
    binding.rootKey === "" ||
    binding.provider !== "sql"
  ) {
    await record(binding, false, "error", "DATA_PROVIDER_ERROR", null, null);
    return {
      status: "error",
      code: "DATA_PROVIDER_ERROR",
      message: "Configuration de la source invalide",
    };
  }

  try {
    const root = await deps.executor.execute({
      sql: binding.queryText,
      params: params.value,
      organizationId: link.organizationId,
      maxRows: binding.maxRows,
    });
    const rows = root.rows.map((row) => ({ ...row }));
    let truncated = root.truncated;
    let byteCount = root.byteCount;

    for (const child of binding.children) {
      for (const row of rows) row[child.path] = [];
      const ids = [
        ...new Set(
          rows
            .map((row) => row[binding.rootKey])
            .filter((value) => value !== null && value !== undefined),
        ),
      ];
      if (ids.length === 0) continue;
      const result = await deps.executor.execute({
        sql: child.queryText,
        params: [ids],
        organizationId: link.organizationId,
        maxRows: binding.maxRows,
      });
      truncated = truncated || result.truncated;
      byteCount += result.byteCount;
      const groups = new Map<unknown, Record<string, unknown>[]>();
      for (const row of result.rows) {
        const key = row[child.foreignKey];
        // La clé étrangère sert à l'assemblage, elle ne fait pas partie du contrat.
        const item = { ...row };
        delete item[child.foreignKey];
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
      }
      for (const row of rows) {
        const group = groups.get(row[binding.rootKey]);
        if (group) (row[child.path] as Record<string, unknown>[]).push(...group);
      }
    }

    const document = { [binding.rootPath]: rows };
    const errors = validateDataValue(contract.schema, document);
    if (errors.length > 0) {
      await record(binding, false, "invalid", "DATA_CONTRACT_INVALID", rows.length, byteCount);
      return {
        status: "error",
        code: "DATA_CONTRACT_INVALID",
        message: "Les données ne respectent pas le contrat",
        fieldErrors: errors.slice(0, 20),
      };
    }

    const meta = {
      cached: false,
      generatedAt: new Date().toISOString(),
      revision: binding.revision,
      truncated,
    };
    if (input.preview !== true) {
      writeTemplateDataCache(cacheKey, { data: document, meta }, binding.cacheTtlSeconds);
    }
    await record(binding, false, "ok", null, rows.length, byteCount);
    return { status: "ok", data: document, meta };
  } catch (error) {
    if (error instanceof TemplateQueryError) {
      await record(binding, false, auditOutcome(error.code), error.code, null, null);
      return {
        status: "error",
        code: error.code,
        message:
          input.preview === true && error.detail !== undefined ? error.detail : error.message,
      };
    }
    await record(binding, false, "error", "DATA_PROVIDER_ERROR", null, null);
    return {
      status: "error",
      code: "DATA_PROVIDER_ERROR",
      message: "Échec du fournisseur de données",
    };
  }
}
