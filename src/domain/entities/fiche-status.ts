/**
 * Statuts de qualification d'une fiche de collecte (ADR-0067 §2).
 * Métadonnées versionnées avec le snapshot de la fiche, jamais des champs.
 */

export const STATUS_KEY_PATTERN = /^[a-z0-9_]+$/;
export const MAX_STATUS_LABEL = 80;
export const MAX_STATUS_COLOR = 20;

export type FicheStatusDefinition = {
  key: string;
  label: string;
  order: number;
  color?: string;
  isDefault: boolean;
  archivedAt: string | null;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseFicheStatuses(
  input: unknown,
  now = new Date().toISOString(),
): { ok: true; value: FicheStatusDefinition[] } | { ok: false; errors: string[] } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["Statuts de qualification invalides"] };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const statuses: FicheStatusDefinition[] = [];
  let defaultCount = 0;

  for (const raw of input) {
    if (!isRecord(raw)) {
      errors.push("Statut de qualification invalide");
      continue;
    }
    const key = text(raw.key);
    if (!STATUS_KEY_PATTERN.test(key)) {
      errors.push(`Clé de statut invalide : ${key === "" ? "(vide)" : key}`);
      continue;
    }
    if (seen.has(key)) {
      errors.push(`Statut en double : ${key}`);
      continue;
    }
    seen.add(key);
    const label = text(raw.label);
    if (label === "") {
      errors.push(`Libellé obligatoire (statut ${key})`);
      continue;
    }
    if (label.length > MAX_STATUS_LABEL) {
      errors.push(`Libellé trop long (statut ${key})`);
      continue;
    }
    const orderRaw = raw.order;
    const order =
      typeof orderRaw === "number" && Number.isInteger(orderRaw) ? orderRaw : statuses.length;
    const color = text(raw.color);
    if (color.length > MAX_STATUS_COLOR) {
      errors.push(`Couleur trop longue (statut ${key})`);
      continue;
    }
    const archivedAt =
      raw.archivedAt === null || raw.archivedAt === undefined ? null : isoDate(raw.archivedAt);
    if (raw.archivedAt !== null && raw.archivedAt !== undefined && archivedAt === null) {
      errors.push(`Date d'archivage invalide (statut ${key})`);
      continue;
    }
    const updatedAt = raw.updatedAt === undefined ? now : isoDate(raw.updatedAt);
    if (updatedAt === null) {
      errors.push(`Date de mise à jour invalide (statut ${key})`);
      continue;
    }
    const isDefault = raw.isDefault === true;
    if (isDefault) defaultCount += 1;
    statuses.push({
      key,
      label,
      order,
      ...(color === "" ? {} : { color }),
      isDefault,
      archivedAt,
      updatedAt,
    });
  }

  if (defaultCount > 1) errors.push("Un seul statut par défaut est autorisé");
  if (statuses.length > 0 && defaultCount === 0) {
    errors.push("Un statut par défaut est obligatoire");
  }
  if (errors.length > 0) return { ok: false, errors };

  statuses.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "fr"));
  return { ok: true, value: statuses };
}

export function findFicheStatus(
  statuses: readonly FicheStatusDefinition[] | undefined,
  key: string | null | undefined,
): FicheStatusDefinition | null {
  if (statuses === undefined || key === null || key === undefined) return null;
  return statuses.find((status) => status.key === key) ?? null;
}

export function defaultFicheStatusKey(
  statuses: readonly FicheStatusDefinition[] | undefined,
): string | null {
  return statuses?.find((status) => status.isDefault && status.archivedAt === null)?.key ?? null;
}
