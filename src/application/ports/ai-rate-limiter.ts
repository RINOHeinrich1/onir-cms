/**
 * Port de régulation des appels IA (ADR-0079).
 * L'implémentation Bottleneck/Valkey reste dans l'infrastructure.
 */
export interface AiRateLimiter {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}
