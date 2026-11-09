import { AiRateLimitError, BadGatewayError } from "@/application/errors";
import { ProviderHttpError } from "@/infrastructure/ai/provider-http-error";

export type ProviderRetryOptions = {
  /** Nombre total de tentatives, première tentative incluse. */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: ProviderHttpError): boolean {
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

function finalError(error: ProviderHttpError): never {
  if (error.status === 429) {
    throw new AiRateLimitError(
      "Le fournisseur IA est temporairement saturé — réessayez dans un instant.",
      error.retryAfterSeconds ?? 5,
    );
  }
  throw new BadGatewayError(error.message);
}

/**
 * Retry amont minimal (ADR-0079) : 429/5xx/réseau, Retry-After respecté,
 * backoff exponentiel + jitter. Ne retente jamais un 4xx de configuration.
 */
export async function runWithProviderRetry<T>(
  operation: () => Promise<T>,
  options: ProviderRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      if (!isRetryable(error)) finalError(error);
      if (attempt >= maxAttempts) finalError(error);

      const retryAfterMs = error.retryAfterSeconds === null ? 0 : error.retryAfterSeconds * 1_000;
      const backoffMs = Math.min(MAX_DELAY_MS, baseDelayMs * 2 ** (attempt - 1));
      const delayMs =
        retryAfterMs > 0
          ? Math.min(MAX_DELAY_MS, retryAfterMs)
          : Math.min(MAX_DELAY_MS, backoffMs + Math.floor(random() * baseDelayMs));
      await sleep(delayMs);
    }
  }

  throw new BadGatewayError("Le fournisseur IA reste indisponible après plusieurs tentatives.");
}
