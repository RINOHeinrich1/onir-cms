import { ValidationError } from "@/application/errors";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { decodeApiCursor } from "@/application/public-api/pagination";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function queryString(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseLimit(params: URLSearchParams, fallback = 25): number {
  const value = queryString(params, "limit");
  if (value === null) return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("limit doit être compris entre 1 et 100");
  }
  return limit;
}

export function parseSort(params: URLSearchParams): ApiSort {
  const value = queryString(params, "sort") ?? "createdAt:desc";
  if (value !== "createdAt:asc" && value !== "createdAt:desc") {
    throw new ValidationError("sort doit valoir createdAt:asc ou createdAt:desc");
  }
  return value === "createdAt:asc" ? "asc" : "desc";
}

export function parseCursor(params: URLSearchParams): ApiCursor | null {
  const value = queryString(params, "cursor");
  if (value === null) return null;
  const cursor = decodeApiCursor(value);
  if (cursor === null) throw new ValidationError("cursor invalide");
  return cursor;
}

export function parseDate(params: URLSearchParams, name: string): string | null {
  const value = queryString(params, name);
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${name} invalide`);
  return parsed.toISOString();
}

export function parseUuid(params: URLSearchParams, name: string): string | null {
  const value = queryString(params, name);
  if (value !== null && !UUID.test(value)) throw new ValidationError(`${name} invalide`);
  return value;
}

export function requireUuid(value: string, label = "identifiant"): string {
  if (!UUID.test(value)) throw new ValidationError(`${label} invalide`);
  return value;
}

export function parseBoolean(params: URLSearchParams, name: string): boolean | null {
  const value = queryString(params, name);
  if (value === null) return null;
  if (value !== "true" && value !== "false") {
    throw new ValidationError(`${name} doit valoir true ou false`);
  }
  return value === "true";
}

export function parseEnum<T extends string>(
  params: URLSearchParams,
  name: string,
  values: readonly T[],
): T | null {
  const value = queryString(params, name);
  if (value === null) return null;
  if (!(values as readonly string[]).includes(value)) {
    throw new ValidationError(`${name} invalide`);
  }
  return value as T;
}

export function parsePositiveVersion(value: string): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new ValidationError("version invalide");
  }
  return version;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Corps JSON invalide");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Objet JSON attendu");
  }
  return body as Record<string, unknown>;
}
