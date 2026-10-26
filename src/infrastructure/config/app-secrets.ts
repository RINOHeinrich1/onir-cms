/**
 * Secrets applicatifs globaux (ADR-0036).
 *
 * Mode géré : CONFIG_MASTER_KEY est présente ; les valeurs sont lues dans
 * `app_secrets`, déchiffrées et conservées en cache. Les valeurs d'environnement
 * servent uniquement à l'import initial.
 *
 * Mode historique : sans CONFIG_MASTER_KEY, les variables d'environnement sont
 * lues à chaque appel (compatibilité tests et démarrage non migré).
 */
import type { Pool, PoolClient } from "pg";
import { ValidationError } from "@/application/errors";
import {
  APP_SECRET_KEYS,
  type AppSecretKey,
  configMasterKey,
  fingerprintAppSecret,
  generateAppSecretValue,
  isAppSecretKey,
  openAppSecret,
  sealAppSecret,
  validateGeneratedAppSecret,
} from "@/infrastructure/config/app-secret-crypto";
import { getPool } from "@/infrastructure/db/pool";
import { env } from "@/lib/env";
import {
  openAiKeyWithKey,
  openLinkTokenWithKey,
  openSecretBoxWithSecret,
  openWebhookSecretWithKey,
  type SealedSecret,
  sealAiKeyWithKey,
  sealLinkTokenWithKey,
  sealSecretBoxWithSecret,
  sealWebhookSecretWithKey,
} from "@/lib/secret-codecs";

export type AppSecretDefinition = {
  label: string;
  description: string;
  impactLabel: string;
};

export const APP_SECRET_DEFINITIONS: Record<AppSecretKey, AppSecretDefinition> = {
  SESSION_SECRET: {
    label: "Secret de session et signatures",
    description: "Signe les URLs médias/pièces jointes et chiffre les identifiants scellés.",
    impactLabel: "identifiants scellés",
  },
  LINK_TOKEN_KEY: {
    label: "Chiffrement des liens",
    description: "Chiffre les jetons des liens de chat et des invitations.",
    impactLabel: "liens et invitations",
  },
  AI_PROVIDER_KEY: {
    label: "Chiffrement des fournisseurs IA",
    description: "Chiffre les clés API des fournisseurs IA stockées en base.",
    impactLabel: "fournisseurs IA",
  },
  WEBHOOK_SECRET_KEY: {
    label: "Chiffrement des webhooks",
    description: "Chiffre les secrets d'authentification et les en-têtes sensibles des webhooks.",
    impactLabel: "webhooks",
  },
};

export type AppSecretSource = "database" | "environment" | "missing";

export type AppSecretImpact = {
  links: number;
  invitations: number;
  providers: number;
  webhooks: number;
  sealedSecrets: number;
};

export type AppSecretStatus = {
  key: AppSecretKey;
  label: string;
  description: string;
  impactLabel: string;
  source: AppSecretSource;
  fingerprint: string | null;
  version: number | null;
  updatedAt: string | null;
  impact: AppSecretImpact;
};

export type AppSecretsOverview = {
  masterConfigured: boolean;
  managed: boolean;
  masterError: string | null;
  secrets: AppSecretStatus[];
};

type SecretRow = {
  key: string;
  value_enc: string;
  fingerprint: string;
  version: number;
  updated_at: Date;
};

type AppSecretsState = {
  cache: Map<AppSecretKey, string>;
  initialized: boolean;
  managed: boolean;
  initAttempted: boolean;
  initPromise: Promise<void> | null;
  refreshTimer: NodeJS.Timeout | null;
};

// Cache partagé entre les bundles Next (instrumentation, routes, pages).
const globalState = globalThis as unknown as { __onirAppSecrets?: AppSecretsState };
const initialState: AppSecretsState = {
  cache: new Map<AppSecretKey, string>(),
  initialized: false,
  managed: false,
  initAttempted: false,
  initPromise: null,
  refreshTimer: null,
};
const state: AppSecretsState = globalState.__onirAppSecrets ?? initialState;
if (globalState.__onirAppSecrets === undefined) globalState.__onirAppSecrets = state;

function legacyRaw(key: AppSecretKey): string | undefined {
  return env(key);
}

function normalizeLegacy(key: AppSecretKey, raw: string): string | null {
  const value = raw.trim();
  if (value === "" || /change[-_]?me/i.test(value)) return null;
  if (key === "SESSION_SECRET") return value;
  return /^[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() : null;
}

function fallbackValue(key: AppSecretKey): string | null {
  const raw = legacyRaw(key);
  return raw === undefined ? null : normalizeLegacy(key, raw);
}

function missingError(key: AppSecretKey): Error {
  return new Error(
    `Secret applicatif manquant : ${key}. Configurez CONFIG_MASTER_KEY puis utilisez /configuration.`,
  );
}

/** Valeur courante — cache géré ou environnement historique. */
export function getAppSecret(key: AppSecretKey): string {
  if (state.managed) {
    const value = state.cache.get(key);
    if (value === undefined) throw missingError(key);
    return value;
  }
  // Ne jamais retomber silencieusement sur d'anciennes valeurs d'environnement
  // après une tentative de démarrage en mode géré.
  if (state.initAttempted && env("CONFIG_MASTER_KEY") !== undefined) {
    throw new Error(
      `Secrets applicatifs non chargés : ${key}. Vérifiez CONFIG_MASTER_KEY et la base.`,
    );
  }
  const value = fallbackValue(key);
  if (value === null) throw missingError(key);
  return value;
}

export function sessionSecret(): string {
  return getAppSecret("SESSION_SECRET");
}

export function linkTokenKey(): Buffer {
  return Buffer.from(getAppSecret("LINK_TOKEN_KEY"), "hex");
}

export function aiProviderKey(): Buffer {
  return Buffer.from(getAppSecret("AI_PROVIDER_KEY"), "hex");
}

export function webhookSecretKey(): Buffer {
  return Buffer.from(getAppSecret("WEBHOOK_SECRET_KEY"), "hex");
}

async function audit(
  client: Pool | PoolClient,
  key: AppSecretKey,
  action: "import" | "generate" | "replace",
  before: string | null,
  after: string,
  actorId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO app_secret_audit
       (key, action, fingerprint_before, fingerprint_after, actor_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [key, action, before, fingerprintAppSecret(after), actorId],
  );
}

async function insertSecret(
  client: Pool | PoolClient,
  key: AppSecretKey,
  value: string,
  master: Buffer,
  action: "import" | "generate",
  actorId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO app_secrets (key, value_enc, fingerprint, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO NOTHING`,
    [key, sealAppSecret(key, value, master), fingerprintAppSecret(value), actorId],
  );
  await audit(client, key, action, null, value, actorId);
}

async function loadFromDatabase(master: Buffer): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<SecretRow>(
    "SELECT key, value_enc, fingerprint, version, updated_at FROM app_secrets",
  );
  const next = new Map<AppSecretKey, string>();
  for (const row of rows) {
    if (!isAppSecretKey(row.key)) continue;
    const value = openAppSecret(row.key, row.value_enc, master);
    if (!keyValueValid(row.key, value)) {
      throw new Error(`Secret applicatif invalide en base : ${row.key}`);
    }
    next.set(row.key, value);
  }
  state.cache.clear();
  for (const [key, value] of next) state.cache.set(key, value);

  for (const key of APP_SECRET_KEYS) {
    if (state.cache.has(key)) continue;
    const candidate = fallbackValue(key);
    const value = candidate ?? generateAppSecretValue();
    const action = candidate === null ? "generate" : "import";
    await insertSecret(pool, key, value, master, action, null);
    state.cache.set(key, value);
  }
}

function keyValueValid(key: AppSecretKey, value: string): boolean {
  if (key === "SESSION_SECRET") return value.length > 0;
  return validateGeneratedAppSecret(value);
}

async function doInit(): Promise<void> {
  state.initAttempted = true;
  let master: Buffer | null = null;
  try {
    master = configMasterKey();
  } catch (error) {
    state.managed = false;
    state.initialized = true;
    throw error;
  }
  if (master === null) {
    state.managed = false;
    state.initialized = true;
    return;
  }
  await loadFromDatabase(master);
  state.managed = true;
  state.initialized = true;
}

/** Charge les secrets depuis la base (ou bascule sur l'environnement). */
export async function initAppSecrets(): Promise<void> {
  if (state.initialized) return;
  if (state.initPromise !== null) return state.initPromise;
  state.initPromise = doInit()
    .catch((error: unknown) => {
      state.managed = false;
      state.initialized = false;
      state.cache.clear();
      process.stderr.write(`[app-secrets] initialisation impossible : ${String(error)}\n`);
    })
    .finally(() => {
      state.initPromise = null;
    });
  return state.initPromise;
}

/** Garantit un chargement avant une lecture asynchrone du panneau. */
export async function ensureAppSecretsLoaded(): Promise<void> {
  if (!state.initialized) await initAppSecrets();
}

/** Recharge depuis la base sans importer ni générer. */
export async function refreshAppSecrets(): Promise<void> {
  const master = configMasterKey();
  if (master === null) {
    state.managed = false;
    state.cache.clear();
    state.initialized = true;
    return;
  }
  const { rows } = await getPool().query<SecretRow>(
    "SELECT key, value_enc, fingerprint, version, updated_at FROM app_secrets",
  );
  const next = new Map<AppSecretKey, string>();
  for (const row of rows) {
    if (!isAppSecretKey(row.key)) continue;
    const value = openAppSecret(row.key, row.value_enc, master);
    if (!keyValueValid(row.key, value)) {
      throw new Error(`Secret applicatif invalide en base : ${row.key}`);
    }
    next.set(row.key, value);
  }
  state.cache.clear();
  for (const [key, value] of next) state.cache.set(key, value);
  state.managed = true;
  state.initialized = true;
}

/** Rafraîchit le cache dans les instances multi-process. */
export function startAppSecretsRefresh(intervalMs = 30_000): void {
  if (state.refreshTimer !== null) return;
  state.refreshTimer = setInterval(() => {
    if (!state.managed) return;
    void refreshAppSecrets().catch((error: unknown) => {
      process.stderr.write(`[app-secrets] rafraîchissement impossible : ${String(error)}\n`);
    });
  }, intervalMs);
  state.refreshTimer.unref?.();
}

async function impactCounts(): Promise<AppSecretImpact> {
  const { rows } = await getPool().query<{
    links: string;
    invitations: string;
    providers: string;
    webhooks: string;
    sealed: string;
  }>(
    `SELECT
       (SELECT count(*) FROM chat_links WHERE token_enc IS NOT NULL)::text AS links,
       (SELECT count(*) FROM organization_invitations)::text AS invitations,
       (SELECT count(*) FROM ai_providers)::text AS providers,
       (SELECT count(*) FROM webhook_endpoints)::text AS webhooks,
       (SELECT count(*) FROM template_reader_credentials)::text AS sealed`,
  );
  const row = rows[0];
  return {
    links: Number(row?.links ?? "0"),
    invitations: Number(row?.invitations ?? "0"),
    providers: Number(row?.providers ?? "0"),
    webhooks: Number(row?.webhooks ?? "0"),
    sealedSecrets: Number(row?.sealed ?? "0"),
  };
}

/** État complet pour l'administration (jamais de valeur secrète). */
export async function getAppSecretsOverview(): Promise<AppSecretsOverview> {
  await ensureAppSecretsLoaded();
  let masterConfigured = false;
  let masterError: string | null = null;
  try {
    masterConfigured = configMasterKey() !== null;
  } catch (error) {
    masterConfigured = true;
    masterError = error instanceof Error ? error.message : "CONFIG_MASTER_KEY invalide";
  }

  let rows: SecretRow[] = [];
  if (state.managed) {
    const result = await getPool().query<SecretRow>(
      "SELECT key, value_enc, fingerprint, version, updated_at FROM app_secrets",
    );
    rows = result.rows;
  }
  const byKey = new Map(rows.filter((row) => isAppSecretKey(row.key)).map((row) => [row.key, row]));
  const impact = await impactCounts();
  const secrets: AppSecretStatus[] = APP_SECRET_KEYS.map((key) => {
    const row = byKey.get(key);
    const envValue = fallbackValue(key);
    const source: AppSecretSource =
      row !== undefined && state.managed
        ? "database"
        : envValue !== null
          ? "environment"
          : "missing";
    return {
      key,
      label: APP_SECRET_DEFINITIONS[key].label,
      description: APP_SECRET_DEFINITIONS[key].description,
      impactLabel: APP_SECRET_DEFINITIONS[key].impactLabel,
      source,
      fingerprint: row?.fingerprint ?? (envValue !== null ? fingerprintAppSecret(envValue) : null),
      version: row?.version ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
      impact,
    };
  });
  return { masterConfigured, managed: state.managed, masterError, secrets };
}

function normalizeNewValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!validateGeneratedAppSecret(normalized)) {
    throw new ValidationError("La valeur doit contenir exactement 64 caractères hexadécimaux");
  }
  return normalized;
}

async function reencryptLinks(client: PoolClient, oldKey: Buffer, newKey: Buffer): Promise<void> {
  const links = await client.query<{ id: string; token_enc: string }>(
    "SELECT id, token_enc FROM chat_links WHERE token_enc IS NOT NULL",
  );
  for (const row of links.rows) {
    const token = openLinkTokenWithKey(row.token_enc, oldKey);
    await client.query("UPDATE chat_links SET token_enc = $1 WHERE id = $2", [
      sealLinkTokenWithKey(token, newKey),
      row.id,
    ]);
  }
  const invitations = await client.query<{ id: string; token_enc: string }>(
    "SELECT id, token_enc FROM organization_invitations",
  );
  for (const row of invitations.rows) {
    const token = openLinkTokenWithKey(row.token_enc, oldKey);
    await client.query("UPDATE organization_invitations SET token_enc = $1 WHERE id = $2", [
      sealLinkTokenWithKey(token, newKey),
      row.id,
    ]);
  }
}

async function reencryptAiKeys(client: PoolClient, oldKey: Buffer, newKey: Buffer): Promise<void> {
  const providers = await client.query<{
    id: string;
    api_key_ciphertext: string;
    api_key_iv: string;
    api_key_tag: string;
  }>("SELECT id, api_key_ciphertext, api_key_iv, api_key_tag FROM ai_providers");
  for (const row of providers.rows) {
    const plain = openAiKeyWithKey(
      {
        ciphertext: row.api_key_ciphertext,
        iv: row.api_key_iv,
        tag: row.api_key_tag,
      },
      oldKey,
    );
    const sealed = sealAiKeyWithKey(plain, newKey);
    await client.query(
      `UPDATE ai_providers
          SET api_key_ciphertext = $1, api_key_iv = $2, api_key_tag = $3, updated_at = now()
        WHERE id = $4`,
      [sealed.ciphertext, sealed.iv, sealed.tag, row.id],
    );
  }
}

type SecretEntry = { name: string; value: string; secret: boolean };

function reencryptEntry(entry: SecretEntry, oldKey: Buffer, newKey: Buffer): SecretEntry {
  return entry.secret
    ? {
        ...entry,
        value: sealWebhookSecretWithKey(openWebhookSecretWithKey(entry.value, oldKey), newKey),
      }
    : entry;
}

async function reencryptWebhooks(
  client: PoolClient,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<void> {
  const endpoints = await client.query<{
    id: string;
    auth_config_enc: string | null;
    headers: unknown;
    query_params: unknown;
  }>("SELECT id, auth_config_enc, headers, query_params FROM webhook_endpoints");
  for (const row of endpoints.rows) {
    const authConfig =
      row.auth_config_enc === null
        ? null
        : sealWebhookSecretWithKey(openWebhookSecretWithKey(row.auth_config_enc, oldKey), newKey);
    const headers = Array.isArray(row.headers)
      ? (row.headers as SecretEntry[]).map((entry) => reencryptEntry(entry, oldKey, newKey))
      : [];
    const queryParams = Array.isArray(row.query_params)
      ? (row.query_params as SecretEntry[]).map((entry) => reencryptEntry(entry, oldKey, newKey))
      : [];
    await client.query(
      `UPDATE webhook_endpoints
          SET auth_config_enc = $1, headers = $2, query_params = $3, updated_at = now()
        WHERE id = $4`,
      [authConfig, JSON.stringify(headers), JSON.stringify(queryParams), row.id],
    );
  }
}

async function reencryptSealedSecrets(
  client: PoolClient,
  oldSecret: string,
  newSecret: string,
): Promise<void> {
  const { rows } = await client.query<{
    password_ciphertext: string;
    password_iv: string;
    password_tag: string;
  }>(
    `SELECT password_ciphertext, password_iv, password_tag
       FROM template_reader_credentials WHERE id = true`,
  );
  const row = rows[0];
  if (row === undefined) return;
  const sealed: SealedSecret = {
    ciphertext: row.password_ciphertext,
    iv: row.password_iv,
    tag: row.password_tag,
  };
  const plain = openSecretBoxWithSecret(sealed, oldSecret);
  const next = sealSecretBoxWithSecret(plain, newSecret);
  await client.query(
    `UPDATE template_reader_credentials
        SET password_ciphertext = $1, password_iv = $2, password_tag = $3
      WHERE id = true`,
    [next.ciphertext, next.iv, next.tag],
  );
}

async function rotateInTransaction(
  key: AppSecretKey,
  oldValue: string,
  newValue: string,
  actorId: string | null,
  action: "replace" | "generate",
): Promise<void> {
  const master = configMasterKey();
  if (master === null) {
    throw new ValidationError("CONFIG_MASTER_KEY est requise pour gérer les secrets");
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (key === "LINK_TOKEN_KEY") {
      await reencryptLinks(client, Buffer.from(oldValue, "hex"), Buffer.from(newValue, "hex"));
    } else if (key === "AI_PROVIDER_KEY") {
      await reencryptAiKeys(client, Buffer.from(oldValue, "hex"), Buffer.from(newValue, "hex"));
    } else if (key === "WEBHOOK_SECRET_KEY") {
      await reencryptWebhooks(client, Buffer.from(oldValue, "hex"), Buffer.from(newValue, "hex"));
    } else {
      await reencryptSealedSecrets(client, oldValue, newValue);
    }
    await client.query(
      `UPDATE app_secrets
          SET value_enc = $1, fingerprint = $2, version = version + 1,
              updated_by = $3, updated_at = now()
        WHERE key = $4`,
      [sealAppSecret(key, newValue, master), fingerprintAppSecret(newValue), actorId, key],
    );
    await audit(client, key, action, fingerprintAppSecret(oldValue), newValue, actorId);
    await client.query("COMMIT");
    state.cache.set(key, newValue);
    state.managed = true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type AppSecretMutationResult = {
  generatedValue: string | null;
  status: AppSecretsOverview;
};

/** Remplace un secret et ré-chiffre ses données dépendantes. */
export async function replaceAppSecret(
  actorId: string,
  key: AppSecretKey,
  value: string,
): Promise<AppSecretMutationResult> {
  await ensureAppSecretsLoaded();
  if (!state.managed) {
    throw new ValidationError(
      "CONFIG_MASTER_KEY est absente : ajoutez-la à .env.release puis redémarrez l'application",
    );
  }
  const normalized = normalizeNewValue(value);
  const oldValue = getAppSecret(key);
  if (oldValue === normalized) {
    return { generatedValue: null, status: await getAppSecretsOverview() };
  }
  await rotateInTransaction(key, oldValue, normalized, actorId, "replace");
  return { generatedValue: null, status: await getAppSecretsOverview() };
}

/** Génère une nouvelle valeur et l'applique immédiatement. */
export async function generateAppSecret(
  actorId: string,
  key: AppSecretKey,
): Promise<AppSecretMutationResult> {
  await ensureAppSecretsLoaded();
  if (!state.managed) {
    throw new ValidationError(
      "CONFIG_MASTER_KEY est absente : ajoutez-la à .env.release puis redémarrez l'application",
    );
  }
  const value = generateAppSecretValue();
  const oldValue = getAppSecret(key);
  await rotateInTransaction(key, oldValue, value, actorId, "generate");
  return {
    generatedValue: value,
    status: await getAppSecretsOverview(),
  };
}
