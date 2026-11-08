import Bottleneck from "bottleneck";
import IORedis from "ioredis";
import { AiRateLimitError } from "@/application/errors";
import type { AiRateLimiter } from "@/application/ports/ai-rate-limiter";
import { type AiRateLimitConfig, aiRateLimitConfig } from "@/lib/env";

type LimiterEntry = {
  local: Bottleneck;
  localShare: Bottleneck;
  distributed: Bottleneck | null;
};

const HEALTH_TTL_MS = 1_000;
const HEALTH_TIMEOUT_MS = 1_500;

let healthClient: IORedis | null = null;
let healthCache = { at: 0, ok: false };
let healthInFlight: Promise<boolean> | null = null;

function redisOptions(url: string): Record<string, unknown> {
  const parsed = new URL(url);
  const protocol = parsed.protocol;
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 6379 : Number(parsed.port),
    ...(parsed.username === "" ? {} : { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password === "" ? {} : { password: decodeURIComponent(parsed.password) }),
    ...(parsed.pathname.length > 1 && parsed.pathname !== "/"
      ? { db: Number(parsed.pathname.slice(1)) }
      : {}),
    ...(protocol === "rediss:" ? { tls: {} } : {}),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: HEALTH_TIMEOUT_MS,
    commandTimeout: HEALTH_TIMEOUT_MS,
  };
}

function getHealthClient(url: string): IORedis {
  if (healthClient === null) {
    healthClient = new IORedis(url, { ...redisOptions(url), lazyConnect: true });
    healthClient.on("error", () => undefined);
  }
  return healthClient;
}

/** Vérifie Valkey sans bloquer longtemps ; le résultat est mémorisé 1 s. */
async function redisReady(config: AiRateLimitConfig): Promise<boolean> {
  if (config.valkeyUrl === undefined) return false;
  const now = Date.now();
  if (now - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  if (healthInFlight !== null) return healthInFlight;

  healthInFlight = (async () => {
    try {
      const client = getHealthClient(config.valkeyUrl as string);
      if (client.status === "wait") await client.connect();
      const ping = client.ping();
      await Promise.race([
        ping,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Valkey health timeout")), HEALTH_TIMEOUT_MS);
        }),
      ]);
      healthCache = { at: Date.now(), ok: true };
      return true;
    } catch {
      healthCache = { at: Date.now(), ok: false };
      return false;
    } finally {
      healthInFlight = null;
    }
  })();
  return healthInFlight;
}

function effectiveMode(config: AiRateLimitConfig): "local" | "distributed" {
  if (config.mode === "auto") return config.replicaCount > 1 ? "distributed" : "local";
  return config.mode;
}

function minTimeFor(rpm: number): number {
  return Math.max(1, Math.ceil(60_000 / Math.max(1, rpm)));
}

function localShareRpm(config: AiRateLimitConfig): number {
  return Math.max(1, Math.floor(config.rpm / Math.max(1, config.replicaCount)));
}

function makeLimiter(
  id: string,
  rpm: number,
  config: AiRateLimitConfig,
  datastore: "local" | "ioredis",
): Bottleneck {
  const limiter = new Bottleneck({
    id,
    datastore,
    clearDatastore: false,
    maxConcurrent: config.maxConcurrent,
    minTime: minTimeFor(rpm),
    highWater: config.queueLimit,
    strategy: Bottleneck.strategy.OVERFLOW,
    rejectOnDrop: true,
    ...(datastore === "ioredis" && config.valkeyUrl !== undefined
      ? { clientOptions: redisOptions(config.valkeyUrl) }
      : {}),
  });
  limiter.on("error", () => undefined);
  return limiter;
}

function isBottleneckError(error: unknown): boolean {
  return error instanceof Error && error.name === "BottleneckError";
}

function rateLimitError(message?: string): AiRateLimitError {
  return new AiRateLimitError(message);
}

export function createAiRateLimiter(config: AiRateLimitConfig): AiRateLimiter {
  const entries = new Map<string, LimiterEntry>();
  const mode = effectiveMode(config);

  const entryFor = (key: string): LimiterEntry => {
    const existing = entries.get(key);
    if (existing !== undefined) return existing;
    const base = `${config.id}:${key}`;
    const entry: LimiterEntry = {
      local: makeLimiter(`${base}:local`, config.rpm, config, "local"),
      localShare: makeLimiter(`${base}:local-share`, localShareRpm(config), config, "local"),
      distributed: null,
    };
    entries.set(key, entry);
    return entry;
  };

  const distributedFor = async (key: string, entry: LimiterEntry): Promise<Bottleneck | null> => {
    if (entry.distributed !== null) return entry.distributed;
    if (!(await redisReady(config)) || config.valkeyUrl === undefined) return null;
    try {
      entry.distributed = makeLimiter(
        `${config.id}:${key}:distributed`,
        config.rpm,
        config,
        "ioredis",
      );
      return entry.distributed;
    } catch {
      return null;
    }
  };

  const chooseLimiter = async (key: string): Promise<Bottleneck> => {
    const entry = entryFor(key);
    if (mode === "local") return entry.local;

    if (entry.distributed !== null) {
      if (await redisReady(config)) return entry.distributed;
      const stale = entry.distributed;
      entry.distributed = null;
      void stale.stop({ dropWaitingJobs: true }).catch(() => undefined);
    }

    const distributed = await distributedFor(key, entry);
    if (distributed !== null) return distributed;

    switch (config.degraded) {
      case "fail_closed":
        throw rateLimitError("Capacité IA momentanément indisponible — réessayez.");
      case "local_share":
        return entry.localShare;
      case "fail_open":
        return entry.local;
    }
  };

  return {
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const limiter = await chooseLimiter(key);
      const queuedAt = Date.now();
      let started = false;
      try {
        return await limiter.schedule(async () => {
          if (Date.now() - queuedAt > config.maxWaitMs) {
            throw rateLimitError("Capacité IA saturée — réessayez dans un instant.");
          }
          started = true;
          return task();
        });
      } catch (error) {
        if (started) throw error;
        if (isBottleneckError(error)) {
          throw rateLimitError("File IA saturée — réessayez dans un instant.");
        }
        throw error;
      }
    },
  };
}

let singleton: AiRateLimiter | null | undefined;

/** Limiteur partagé du processus ; null si le rate limiting est désactivé. */
export function getAiRateLimiter(): AiRateLimiter | null {
  if (singleton !== undefined) return singleton;
  const config = aiRateLimitConfig();
  singleton = config.enabled ? createAiRateLimiter(config) : null;
  return singleton;
}
