/**
 * Lecture d'environnement centralisée (A011).
 * Toutes les variables sont lues ici : aucun `process.env` dispersé dans le code.
 * `env()` renvoie `undefined` si absente ou vide ; les accesseurs "forts"
 * (`databaseUrl`, `appUrl`, ...) échouent explicitement pour éviter
 * une config silencieusement incomplète.
 */

export function env(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function required(name: string): string {
  const value = env(name);
  if (value === undefined) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export type StorageDriver = "disk" | "s3";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
};

function positiveInt(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

/** Nombre d’instances applicatives (utilisé pour les garde-fous de déploiement). */
export function replicaCount(): number {
  return positiveInt("REPLICA_COUNT", 1);
}

/** Configuration S3 si complète, sinon `null`. */
export function s3Config(): S3Config | null {
  const endpoint = env("S3_ENDPOINT");
  const bucket = env("S3_BUCKET");
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  if (
    endpoint === undefined ||
    bucket === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined
  ) {
    return null;
  }
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: env("S3_REGION") ?? "us-east-1",
    forcePathStyle: booleanEnv("S3_FORCE_PATH_STYLE", true),
    prefix: env("S3_PREFIX") ?? "",
  };
}

/** Driver effectif : `auto` privilégie S3 si configuré, sinon le disque. */
export function storageDriver(): StorageDriver {
  const configured = env("STORAGE_DRIVER") ?? "auto";
  if (configured !== "auto" && configured !== "disk" && configured !== "s3") {
    throw new Error(`STORAGE_DRIVER invalide : ${configured}`);
  }
  if (configured === "auto") return s3Config() === null ? "disk" : "s3";
  return configured;
}

export type RealtimeMode = "local" | "valkey" | "polling";

/** URL Valkey/Redis-compatible pour le Pub/Sub temps réel. */
export function valkeyUrl(): string | undefined {
  return env("VALKEY_URL");
}

/** Mode temps réel effectif. */
export function realtimeMode(): RealtimeMode {
  const configured = env("REALTIME_MODE") ?? "auto";
  if (
    configured !== "auto" &&
    configured !== "local" &&
    configured !== "valkey" &&
    configured !== "polling"
  ) {
    throw new Error(`REALTIME_MODE invalide : ${configured}`);
  }
  if (configured === "auto") {
    if (valkeyUrl() !== undefined) return "valkey";
    return replicaCount() > 1 ? "polling" : "local";
  }
  return configured;
}

/**
 * Garde-fous de topologie : refuse les combinaisons qui produiraient des
 * fichiers ou des événements incohérents entre instances.
 */
export function assertDeploymentConfig(): void {
  const replicas = replicaCount();
  const storage = storageDriver();
  const realtime = realtimeMode();
  if (storage === "s3" && s3Config() === null) {
    throw new Error("STORAGE_DRIVER=s3 mais la configuration S3 est incomplète");
  }
  if (replicas > 1 && storage === "disk") {
    throw new Error("REPLICA_COUNT > 1 exige STORAGE_DRIVER=s3");
  }
  if (replicas > 1 && realtime === "local") {
    throw new Error("REPLICA_COUNT > 1 interdit REALTIME_MODE=local");
  }
  if (realtime === "valkey" && valkeyUrl() === undefined) {
    throw new Error("REALTIME_MODE=valkey exige VALKEY_URL");
  }
}

/** Clé de service utilisée par les API plateforme (backoffice commercial). */
export function platformApiKey(): string | undefined {
  return env("PLATFORM_API_KEY");
}

/** Identité réelle du compte de service plateforme. */
export function platformApiUserId(): string | undefined {
  return env("PLATFORM_API_USER_ID");
}

/** URL de connexion PostgreSQL dédiée (RM-DATA-001). */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/**
 * Connexion dédiée au rôle lecture seule des ressources de données (ADR-0026).
 * Optionnelle : à défaut, les identifiants gérés dans le panneau sont utilisés.
 */
export function templateDatabaseUrl(): string | undefined {
  return env("TEMPLATE_DATABASE_URL");
}

/** URL publique du backoffice (défaut local port 3008). */
export function appUrl(): string {
  return env("APP_URL") ?? "http://localhost:3008";
}

/** URL publique des liens et widgets. Retombe sur le backoffice si non configurée. */
export function publicLinkBaseUrl(): string {
  return env("PUBLIC_LINK_BASE_URL") ?? appUrl();
}

/**
 * Répertoire de stockage des fichiers médias (photothèque).
 * Hors `public/` : les fichiers sont servis par une route dédiée.
 * Défaut : `var/media` à la racine du projet (persistant sur le serveur).
 */
export function mediaDir(): string {
  return env("MEDIA_DIR") ?? `${process.cwd()}/var/media`;
}

/**
 * Répertoire des pièces jointes de prospection (ADR-0034).
 * Défaut : sous-répertoire du stockage média (volume persistant existant).
 */
export function attachmentsDir(): string {
  return env("ATTACHMENTS_DIR") ?? `${mediaDir()}/attachments`;
}

export type AiConfig = {
  token: string;
  productId: string;
  model: string;
};

/** Configuration legacy du fournisseur IA (Infomaniak) — fallback de transition. */
export function aiConfig(): AiConfig {
  return {
    token: required("AI_API_TOKEN"),
    productId: required("AI_PRODUCT_ID"),
    model: env("AI_MODEL") ?? "Qwen/Qwen3.5-122B-A10B-FP8",
  };
}

export type LegacyAiCredentials = {
  token: string;
  productId: string;
  model: string;
};

/**
 * Configuration IA historique lue dans l'environnement.
 * `null` si le couple token/produit est incomplet : le fallback est alors
 * simplement indisponible, sans faire échouer le démarrage.
 */
export function legacyAiCredentials(): LegacyAiCredentials | null {
  const token = env("AI_API_TOKEN");
  const productId = env("AI_PRODUCT_ID");
  if (token === undefined || productId === undefined) return null;
  return {
    token,
    productId,
    model: env("AI_MODEL") ?? "Qwen/Qwen3.5-122B-A10B-FP8",
  };
}

/** Autorise explicitement les fournisseurs sur réseau privé (auto-hébergement). */
export function allowPrivateAiNetworks(): boolean {
  return env("AI_ALLOW_PRIVATE_NETWORKS") === "true";
}

/** Active le worker de livraison des webhooks (désactivable en test). */
export function webhookWorkerEnabled(): boolean {
  return env("WEBHOOK_WORKER_ENABLED") !== "false";
}

export type RuntimeCacheConfig = {
  enabled: boolean;
  url: string | undefined;
  centralUrl: string | undefined;
  prefix: string;
  configTtlMs: number;
  linkConfigTtlMs: number;
  knowledgeTtlMs: number;
  mediaTtlMs: number;
};

/** Cache runtime local (ADR-0076) : L1 mémoire + L2 Valkey local. */
export function runtimeCacheConfig(): RuntimeCacheConfig {
  return {
    enabled: booleanEnv("RUNTIME_CACHE_ENABLED", false),
    url: env("RUNTIME_CACHE_URL"),
    centralUrl: env("VALKEY_URL"),
    prefix: env("RUNTIME_CACHE_PREFIX") ?? "onir:runtime:v1",
    configTtlMs: positiveInt("RUNTIME_CACHE_CONFIG_TTL_MS", 60 * 60 * 1000),
    linkConfigTtlMs: positiveInt("RUNTIME_CACHE_LINK_CONFIG_TTL_MS", 30_000),
    knowledgeTtlMs: positiveInt("RUNTIME_CACHE_KNOWLEDGE_TTL_MS", 60_000),
    mediaTtlMs: positiveInt("RUNTIME_CACHE_MEDIA_TTL_MS", 60_000),
  };
}

export type AiRateLimitMode = "auto" | "local" | "distributed";
export type AiRateLimitDegraded = "fail_closed" | "local_share" | "fail_open";

export type AiRateLimitConfig = {
  enabled: boolean;
  mode: AiRateLimitMode;
  degraded: AiRateLimitDegraded;
  rpm: number;
  maxConcurrent: number;
  queueLimit: number;
  maxWaitMs: number;
  replicaCount: number;
  valkeyUrl: string | undefined;
  id: string;
};

function oneOf<T extends string>(name: string, values: readonly T[], fallback: T): T {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return values.includes(raw as T) ? (raw as T) : fallback;
}

/** Configuration du rate limiting IA (ADR-0079). */
export function aiRateLimitConfig(): AiRateLimitConfig {
  return {
    enabled: booleanEnv("AI_RATE_LIMIT_ENABLED", false),
    mode: oneOf("AI_RATE_LIMIT_MODE", ["auto", "local", "distributed"] as const, "auto"),
    degraded: oneOf(
      "AI_RATE_LIMIT_DEGRADED",
      ["fail_closed", "local_share", "fail_open"] as const,
      "local_share",
    ),
    rpm: positiveInt("AI_RATE_LIMIT_RPM", 55),
    maxConcurrent: positiveInt("AI_RATE_LIMIT_MAX_CONCURRENT", 4),
    queueLimit: positiveInt("AI_RATE_LIMIT_QUEUE_LIMIT", 100),
    maxWaitMs: positiveInt("AI_RATE_LIMIT_MAX_WAIT_MS", 15_000),
    replicaCount: replicaCount(),
    valkeyUrl: valkeyUrl(),
    id: env("AI_RATE_LIMIT_ID") ?? "onir:ai:shared",
  };
}

/** Compte administrateur par défaut (seed), jamais exposé au client. */
export type DefaultAdmin = {
  email: string;
  password: string;
};

export function defaultAdmin(): DefaultAdmin {
  return {
    email: required("DEFAULT_ADMIN_EMAIL"),
    password: required("DEFAULT_ADMIN_PASSWORD"),
  };
}
