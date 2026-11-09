/**
 * Erreur HTTP d'un fournisseur IA. Le statut permet au wrapper de retry de
 * distinguer un 429/5xx transitoire d'une erreur de configuration.
 */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function retryAfterFromHeaders(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null || raw.trim() === "") return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
