/**
 * Composition assistée d'une requête de source de données (collection principale).
 * Fonctions pures : mapping contrat → colonnes, génération SQL sûre et bornée.
 */

export const FILTER_OPERATORS = [
  "=",
  "<>",
  ">",
  ">=",
  "<",
  "<=",
  "ILIKE",
  "IS NULL",
  "IS NOT NULL",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type QueryFilter = {
  column: string;
  operator: FilterOperator;
  value: string;
};

export type QueryComposition = {
  view: string;
  fields: readonly string[];
  mapping: Readonly<Record<string, string>>;
  filters: readonly QueryFilter[];
  orderBy: string;
  orderDirection: "asc" | "desc";
  limit: number;
};

export type ChildQueryComposition = {
  view: string;
  foreignKey: string;
  fields: readonly string[];
  mapping: Readonly<Record<string, string>>;
  filters?: readonly QueryFilter[];
  orderBy: string;
  orderDirection: "asc" | "desc";
};

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Champs racine affichables comme colonnes : on exclut les tableaux (collections liées). */
export function scalarFieldNames(properties: Readonly<Record<string, { type: string }>>): string[] {
  return Object.entries(properties)
    .filter(([, node]) => node.type !== "array")
    .map(([name]) => name);
}

export function quoteIdentifier(value: string): string {
  return SAFE_IDENTIFIER.test(value) ? value : `"${value.replace(/"/g, '""')}"`;
}

/** Littéral SQL simple (nombre, booléen, texte échappé). */
export function sqlLiteral(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "''";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === "true" || lower === "false") return lower;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min((previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[right.length] ?? 0;
}

/**
 * Propose une colonne pour chaque champ du contrat : correspondance normalisée
 * exacte, puis distance d'édition ≤ 2 (jamais deux champs sur la même colonne).
 */
export function autoMapContractFields(
  fields: readonly string[],
  columns: readonly { name: string }[],
): Record<string, string> {
  const candidates = columns.map((column) => ({
    name: column.name,
    normalized: normalize(column.name),
  }));
  const remaining = new Set(candidates.map((column) => column.name));
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    const target = normalize(field);
    const exact = candidates.find(
      (column) => column.normalized === target && remaining.has(column.name),
    );
    if (exact !== undefined) {
      mapping[field] = exact.name;
      remaining.delete(exact.name);
    }
  }

  for (const field of fields) {
    if (mapping[field] !== undefined) continue;
    const target = normalize(field);
    if (target.length < 4) continue;
    let best: { name: string; distance: number } | null = null;
    for (const column of candidates) {
      if (!remaining.has(column.name) || column.normalized.length < 4) continue;
      const distance = editDistance(target, column.normalized);
      if (distance <= 2 && (best === null || distance < best.distance)) {
        best = { name: column.name, distance };
      }
    }
    if (best !== null) {
      mapping[field] = best.name;
      remaining.delete(best.name);
    }
  }

  return mapping;
}

function filterSql(filter: QueryFilter): string | null {
  if (filter.column === "") return null;
  const column = quoteIdentifier(filter.column);
  if (filter.operator === "IS NULL" || filter.operator === "IS NOT NULL") {
    return `${column} ${filter.operator}`;
  }
  return `${column} ${filter.operator} ${sqlLiteral(filter.value)}`;
}

/** Génère un SELECT borné ; les champs non mappés sont ignorés. */
export function generateTemplateQuery(input: QueryComposition): string {
  const selections = input.fields.flatMap((field) => {
    const column = input.mapping[field];
    if (column === undefined || column === "") return [];
    const source = quoteIdentifier(column);
    const alias = quoteIdentifier(field);
    return [source === alias ? source : `${source} AS ${alias}`];
  });
  if (selections.length === 0) return "";

  const filters = input.filters
    .map((filter) => filterSql(filter))
    .filter((entry): entry is string => entry !== null);

  const limit = Math.min(1000, Math.max(1, Math.trunc(input.limit) || 50));
  let sql = `SELECT ${selections.join(", ")} FROM ${quoteIdentifier(input.view)}`;
  if (filters.length > 0) sql += ` WHERE ${filters.join(" AND ")}`;
  if (input.orderBy.trim() !== "") {
    sql += ` ORDER BY ${quoteIdentifier(input.orderBy)} ${input.orderDirection === "desc" ? "DESC" : "ASC"}`;
  }
  return `${sql} LIMIT ${limit}`;
}

/** Devine la colonne de rattachement (book_id, media_id, parent_id…). */
function singularize(path: string): string {
  if (path.endsWith("ies")) return `${path.slice(0, -3)}y`;
  if (path.endsWith("s")) return path.slice(0, -1);
  return path;
}

/** Devine la colonne de rattachement (book_id, media_id, category_id, parent_id…). */
export function guessForeignKey(
  path: string,
  columns: readonly { name: string }[],
  parentPath = "",
): string {
  const childSingular = singularize(path);
  const parentSingular = singularize(parentPath);
  const targets = [
    `${parentSingular}_id`,
    `${parentPath}_id`,
    `${childSingular}_id`,
    `${path}_id`,
    "parent_id",
  ].filter((target) => target !== "_id");
  for (const target of targets) {
    const found = columns.find((column) => column.name.toLowerCase() === target.toLowerCase());
    if (found !== undefined) return found.name;
  }
  return "";
}

/**
 * Ordonne les colonnes pour le choix d'une clé de rattachement : clé devinée,
 * puis `category_id`, puis les autres clés `*_id`, puis `id`, puis le reste.
 */
export function orderForeignKeyColumns(
  columns: readonly { name: string }[],
  path: string,
  parentPath = "",
): { name: string }[] {
  const guessed = guessForeignKey(path, columns, parentPath);
  const score = (name: string): number => {
    if (name === guessed) return 0;
    if (name.toLowerCase() === "category_id") return 1;
    if (name.toLowerCase().endsWith("_id")) return 2;
    if (name.toLowerCase() === "id") return 3;
    return 4;
  };
  return [...columns].sort(
    (left, right) => score(left.name) - score(right.name) || left.name.localeCompare(right.name),
  );
}

/**
 * Requête enfant : la clé de rattachement est sélectionnée (puis retirée de
 * l'item par le chargeur), les identifiants parents arrivent en `$1`.
 */
export function generateChildQuery(input: ChildQueryComposition): string {
  if (input.foreignKey === "") return "";
  const selections: string[] = [quoteIdentifier(input.foreignKey)];
  const seen = new Set([input.foreignKey]);
  for (const field of input.fields) {
    const column = input.mapping[field];
    if (column === undefined || column === "" || seen.has(column)) continue;
    seen.add(column);
    const source = quoteIdentifier(column);
    const alias = quoteIdentifier(field);
    selections.push(source === alias ? source : `${source} AS ${alias}`);
  }
  if (selections.length === 1) return "";
  const foreignKey = quoteIdentifier(input.foreignKey);
  const filters = (input.filters ?? [])
    .map((filter) => filterSql(filter))
    .filter((entry): entry is string => entry !== null);
  let sql = `SELECT ${selections.join(", ")} FROM ${quoteIdentifier(input.view)}`;
  sql += ` WHERE ${foreignKey} = ANY($1)`;
  if (filters.length > 0) sql += ` AND ${filters.join(" AND ")}`;
  if (input.orderBy.trim() !== "") {
    sql += ` ORDER BY ${quoteIdentifier(input.orderBy)} ${input.orderDirection === "desc" ? "DESC" : "ASC"}`;
  }
  return sql;
}
