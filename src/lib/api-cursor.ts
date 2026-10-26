import type { FicheSearchCursor } from "@/application/ports/fiche-search-repository";

/** Encode un curseur keyset opaque (createdAt + id). */
export function encodeFicheCursor(cursor: FicheSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Décode un curseur ; `null` si mal formé (jamais d'exception côté API). */
export function decodeFicheCursor(value: string): FicheSearchCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.createdAt))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}
