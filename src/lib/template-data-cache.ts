/**
 * Cache mémoire des ressources de données (ADR-0026 §8).
 * Clé = organisation + binding + révision + contrat + entrées ; TTL par binding.
 * Un redémarrage vide le cache ; la `revision` invalide les entrées à la sauvegarde.
 */
import type { TemplateDataMeta } from "@/domain/template-data";

export type CachedTemplateData = {
  data: unknown;
  meta: TemplateDataMeta;
};

const MAX_ENTRIES = 500;
const store = new Map<string, { expiresAt: number; value: CachedTemplateData }>();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function templateDataCacheKey(input: {
  organizationId: string;
  bindingId: string;
  revision: number;
  contractKey: string;
  inputs: Record<string, unknown>;
}): string {
  return [
    input.organizationId,
    input.bindingId,
    input.revision,
    input.contractKey,
    stableStringify(input.inputs),
  ].join("|");
}

export function readTemplateDataCache(key: string): CachedTemplateData | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function writeTemplateDataCache(
  key: string,
  value: CachedTemplateData,
  ttlSeconds: number,
): void {
  if (ttlSeconds <= 0) return;
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
}

export function clearTemplateDataCache(): void {
  store.clear();
}
