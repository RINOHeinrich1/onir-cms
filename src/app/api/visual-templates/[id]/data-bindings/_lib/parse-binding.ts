import { ValidationError } from "@/application/errors";
import type { TemplateDataContract } from "@/domain/data-contracts";
import type { TemplateDataChildQuery, TemplateDataQueryInput } from "@/domain/template-data";
import { assertReadOnlyQuery } from "@/infrastructure/db/template-query-executor";

/** Valide le SQL et convertit toute erreur technique en erreur de validation. */
export function assertTemplateQuery(sql: string): void {
  if (sql.trim() === "") {
    throw new ValidationError("Requête SQL requise");
  }
  try {
    assertReadOnlyQuery(sql);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Requête SQL invalide");
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integerField(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = body[key];
  if (raw === undefined) return fallback;
  const value = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${key} : entier entre ${min} et ${max}`);
  }
  return value;
}

export function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "" || name.length > 60) {
    throw new ValidationError("name : 1 à 60 caractères");
  }
  return name;
}

export function parseChildren(raw: unknown): TemplateDataChildQuery[] {
  if (!Array.isArray(raw) || raw.length > 3) throw new ValidationError("children : 0 à 3 entrées");
  return raw.map((entry, index) => {
    const child = record(entry);
    const path = typeof child.path === "string" ? child.path.trim() : "";
    const queryText = typeof child.query_text === "string" ? child.query_text.trim() : "";
    const foreignKey = typeof child.foreign_key === "string" ? child.foreign_key.trim() : "";
    if (path === "" || path.length > 64)
      throw new ValidationError(`children[${index}].path invalide`);
    if (foreignKey === "" || foreignKey.length > 64) {
      throw new ValidationError(`children[${index}].foreign_key invalide`);
    }
    assertTemplateQuery(queryText);
    return { path, queryText, foreignKey };
  });
}

export function parseQueryInputs(
  raw: unknown,
  inputKeys: Set<string>,
  paramKeys: Set<string>,
): TemplateDataQueryInput[] {
  if (!Array.isArray(raw) || raw.length > 10) {
    throw new ValidationError("query_inputs : 0 à 10 entrées");
  }
  const seen = new Set<number>();
  return raw.map((entry, index) => {
    const item = record(entry);
    const number = typeof item.index === "number" ? item.index : Number.NaN;
    const from = typeof item.from === "string" ? item.from : "";
    if (!Number.isInteger(number) || number < 1 || number > 10 || seen.has(number)) {
      throw new ValidationError(`query_inputs[${index}].index invalide ou dupliqué`);
    }
    seen.add(number);
    const [kind, key] = from.split(":", 2);
    if (kind === "input" && key !== undefined && inputKeys.has(key)) return { index: number, from };
    if (kind === "link" && key !== undefined && paramKeys.has(key)) return { index: number, from };
    if (from === "system:locale") return { index: number, from };
    throw new ValidationError(`query_inputs[${index}].from non autorisé`);
  });
}

export function parseBindingFields(
  body: Record<string, unknown>,
  contract: TemplateDataContract,
  paramKeys: Set<string>,
) {
  const queryText = typeof body.queryText === "string" ? body.queryText.trim() : "";
  assertTemplateQuery(queryText);
  const rootPath = typeof body.rootPath === "string" ? body.rootPath.trim() : "";
  if (rootPath === "" || rootPath.length > 64) throw new ValidationError("rootPath invalide");
  if (
    contract.schema.type !== "object" ||
    contract.schema.properties?.[rootPath]?.type !== "array"
  ) {
    throw new ValidationError("rootPath doit désigner un tableau du contrat");
  }
  const rootKey = (typeof body.rootKey === "string" ? body.rootKey.trim() : "") || "id";
  if (rootKey.length > 64) throw new ValidationError("rootKey invalide");
  const invalidateOn = typeof body.invalidateOn === "string" ? body.invalidateOn : "none";
  if (!["none", "medias", "connaissances", "prospects"].includes(invalidateOn)) {
    throw new ValidationError("invalidateOn invalide");
  }
  return {
    name: parseName(body.name ?? "Défaut"),
    queryText,
    rootPath,
    rootKey,
    children: parseChildren(body.children ?? []),
    queryInputs: parseQueryInputs(
      body.queryInputs ?? [],
      new Set(contract.inputs.map((input) => input.key)),
      paramKeys,
    ),
    invalidateOn: invalidateOn as "none" | "medias" | "connaissances" | "prospects",
    cacheTtlSeconds: integerField(body, "cacheTtlSeconds", 300, 0, 3600),
    maxRows: integerField(body, "maxRows", 200, 1, 1000),
    enabled: body.enabled === true,
  };
}
