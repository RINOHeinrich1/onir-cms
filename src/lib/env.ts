/**
 * Lecture d'environnement centralisée (A011).
 * Toutes les variables sont lues ici : aucun `process.env` dispersé dans le code.
 * `env()` renvoie `undefined` si absente ou vide ; les accesseurs "forts"
 * (`databaseUrl`, `sessionSecret`, ...) échouent explicitement pour éviter
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

/** URL de connexion PostgreSQL dédiée (RM-DATA-001). */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/** Secret applicatif de session. */
export function sessionSecret(): string {
  return required("SESSION_SECRET");
}

/**
 * Connexion dédiée au rôle lecture seule des ressources de données (ADR-0026).
 * Optionnelle : à défaut, les identifiants gérés dans le panneau sont utilisés.
 */
export function templateDatabaseUrl(): string | undefined {
  return env("TEMPLATE_DATABASE_URL");
}

/** URL publique de l'application (défaut local port 3008). */
export function appUrl(): string {
  return env("APP_URL") ?? "http://localhost:3008";
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

/**
 * Clé de chiffrement des clés API fournisseurs (AES-256-GCM).
 * 64 caractères hexadécimaux = 32 octets. Lue uniquement au moment d'écrire
 * ou de déchiffrer un fournisseur, jamais au démarrage.
 */
export function aiProviderKey(): Buffer {
  const raw = required("AI_PROVIDER_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("AI_PROVIDER_KEY invalide : 64 caractères hexadécimaux attendus");
  }
  return Buffer.from(raw, "hex");
}

/** Autorise explicitement les fournisseurs sur réseau privé (auto-hébergement). */
export function allowPrivateAiNetworks(): boolean {
  return env("AI_ALLOW_PRIVATE_NETWORKS") === "true";
}

/**
 * Clé 32 octets (64 hex) de chiffrement des jetons de liens (AES-256-GCM).
 * Génération : `openssl rand -hex 32`. Jamais commise, jamais exposée.
 */
export function linkTokenKey(): Buffer {
  const raw = required("LINK_TOKEN_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("LINK_TOKEN_KEY invalide : 64 caractères hexadécimaux attendus");
  }
  return Buffer.from(raw, "hex");
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
