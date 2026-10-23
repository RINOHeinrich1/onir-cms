export type RateLimitResult = { limited: false } | { limited: true; retryAfterSeconds: number };

export type RateLimiterOptions = {
  /** Nombre maximal de requêtes acceptées par fenêtre et par clé. */
  limit: number;
  /** Durée de la fenêtre glissante en millisecondes. */
  windowMs: number;
  /** Horloge injectable (tests). */
  now?: () => number;
};

export type RateLimiter = (key: string) => RateLimitResult;

/**
 * Limiteur à fenêtre glissante, en mémoire du process (A012).
 * Suffisant ici : une seule instance PM2 (fork) sert le dashboard.
 * Nettoyage opportuniste quand la table grossit.
 *
 * Implémentation simple, en mémoire, adaptée à une instance unique.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();

  return (key: string): RateLimitResult => {
    const at = now();
    const windowStart = at - windowMs;
    const recent = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= limit) {
      const oldest = Math.min(...recent);
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - at) / 1000)),
      };
    }

    recent.push(at);
    hits.set(key, recent);

    if (hits.size > 10000) {
      for (const [storedKey, timestamps] of hits) {
        const last = timestamps[timestamps.length - 1];
        if (last === undefined || last <= windowStart) hits.delete(storedKey);
      }
    }

    return { limited: false };
  };
}

/** Connexion : 10 tentatives / 10 min par clé (anti-bruteforce, RM-AUTH-001). */
export const loginLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Changement de mot de passe : 10 tentatives / 10 min par utilisateur. */
export const changePasswordLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Acceptation d'invitation : 10 tentatives / 10 min par IP. */
export const invitationLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });
