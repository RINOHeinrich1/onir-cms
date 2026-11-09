import IORedis from "ioredis";
import { type RuntimeCacheConfig, runtimeCacheConfig } from "@/lib/env";

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const MAX_MEMORY_ENTRIES = 1_000;
const INVALIDATION_CHANNEL = "onir:runtime:cache:invalidate";

function redisOptions(url: string): Record<string, unknown> {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 6379 : Number(parsed.port),
    ...(parsed.username === "" ? {} : { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password === "" ? {} : { password: decodeURIComponent(parsed.password) }),
    ...(parsed.pathname.length > 1 && parsed.pathname !== "/"
      ? { db: Number(parsed.pathname.slice(1)) }
      : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    commandTimeout: 1_000,
  };
}

function createClient(url: string): IORedis {
  const client = new IORedis(url, redisOptions(url));
  client.on("error", () => undefined);
  return client;
}

/**
 * Cache runtime à deux niveaux :
 * - L1 mémoire du processus ;
 * - L2 Valkey local au nœud.
 *
 * Les erreurs cache ne remontent jamais à l'application : le repository
 * appelant retombe sur PostgreSQL.
 */
export class RuntimeCache {
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly local: IORedis | null;
  private readonly central: IORedis | null;
  private readonly subscriber: IORedis | null;

  constructor(private readonly config: RuntimeCacheConfig) {
    this.local = config.url === undefined ? null : createClient(config.url);
    this.central = config.centralUrl === undefined ? null : createClient(config.centralUrl);
    this.subscriber = config.centralUrl === undefined ? null : createClient(config.centralUrl);
    if (this.subscriber !== null) {
      this.subscriber.subscribe(INVALIDATION_CHANNEL).catch(() => undefined);
      this.subscriber.on("message", (_channel, payload) => {
        try {
          const message = JSON.parse(payload) as { prefix?: unknown };
          if (typeof message.prefix === "string") {
            this.removeLocalByPrefix(message.prefix);
            void this.removeLocalRedisByPrefix(message.prefix);
          }
        } catch {
          // Ignore les messages malformés.
        }
      });
    }
  }

  key(...parts: string[]): string {
    return [this.config.prefix, ...parts].join(":");
  }

  prefixFor(...parts: string[]): string {
    return [this.config.prefix, ...parts].join(":");
  }

  async getJson<T>(key: string): Promise<T | null> {
    const now = Date.now();
    const hit = this.memory.get(key);
    if (hit !== undefined) {
      if (hit.expiresAt > now) return JSON.parse(hit.value) as T;
      this.memory.delete(key);
    }
    if (this.local === null || this.local.status !== "ready") return null;
    try {
      const raw = await this.local.get(key);
      if (raw === null) return null;
      const value = JSON.parse(raw) as T;
      this.setMemory(key, raw, Math.min(this.config.configTtlMs, 60_000));
      return value;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    const raw = JSON.stringify(value);
    this.setMemory(key, raw, ttlMs);
    if (this.local === null || this.local.status !== "ready") return;
    try {
      await this.local.set(key, raw, "PX", ttlMs);
    } catch {
      // Cache best-effort.
    }
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    this.removeLocalByPrefix(prefix);
    await this.removeLocalRedisByPrefix(prefix);
    if (this.central !== null) {
      void this.central
        .publish(INVALIDATION_CHANNEL, JSON.stringify({ prefix }))
        .catch(() => undefined);
    }
  }

  private async removeLocalRedisByPrefix(prefix: string): Promise<void> {
    if (this.local === null || this.local.status !== "ready") return;
    try {
      let cursor = "0";
      do {
        const [next, keys] = await this.local.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await this.local.unlink(...keys);
      } while (cursor !== "0");
    } catch {
      // TTL de secours.
    }
  }

  private setMemory(key: string, value: string, ttlMs: number): void {
    if (this.memory.size >= MAX_MEMORY_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, { expiresAt: Date.now() + ttlMs, value });
  }

  private removeLocalByPrefix(prefix: string): void {
    for (const key of this.memory.keys()) {
      if (key.startsWith(prefix)) this.memory.delete(key);
    }
  }
}

let singleton: RuntimeCache | null | undefined;

/** Cache runtime partagé du processus ; null si désactivé. */
export function getRuntimeCache(): RuntimeCache | null {
  if (singleton !== undefined) return singleton;
  const config = runtimeCacheConfig();
  singleton = config.enabled ? new RuntimeCache(config) : null;
  return singleton;
}
