/**
 * Administration du compte PostgreSQL de lecture (ADR-0026).
 *
 * Le mot de passe est généré côté serveur, appliqué au rôle de connexion avec
 * une échéance optionnelle (`VALID UNTIL`), chiffré puis stocké. Le runtime
 * renouvelle automatiquement le mot de passe avant expiration.
 */
import { randomBytes } from "node:crypto";
import { ValidationError } from "@/application/errors";
import type { TemplateReaderAccountStore } from "@/application/ports/template-reader-account-store";
import type {
  TemplateReaderCredentials,
  TemplateReaderCredentialsRepository,
} from "@/application/ports/template-reader-credentials-repository";
import type { TemplateReaderProvisioner } from "@/application/ports/template-reader-provisioner";
import { templateDatabaseUrl } from "@/lib/env";
import { sealSecret } from "@/lib/secret-box";
import { readerConnectionString, readerTarget } from "@/lib/template-reader-connection";

export type TemplateReaderDependencies = {
  credentials: TemplateReaderCredentialsRepository;
  provisioner: TemplateReaderProvisioner;
  accounts: TemplateReaderAccountStore;
};

export type TemplateReaderStatus = {
  configured: boolean;
  userName: string | null;
  target: string;
  revision: number | null;
  rotatedAt: string | null;
  /** 0 = pas d'expiration ; `null` si aucun compte. */
  validityDays: number | null;
  expiresAt: string | null;
  /** `TEMPLATE_DATABASE_URL` est défini : il a priorité sur le panneau. */
  envOverride: boolean;
};

const MAX_VALIDITY_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 0 = jamais ; entier 1..3650 sinon. */
export function parseValidityDays(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_VALIDITY_DAYS) {
    throw new ValidationError(`validityDays : entier entre 0 et ${MAX_VALIDITY_DAYS}`);
  }
  return value;
}

function expiresAtFor(days: number): string | null {
  return days === 0 ? null : new Date(Date.now() + days * DAY_MS).toISOString();
}

export async function getTemplateReaderStatus(
  deps: TemplateReaderDependencies,
): Promise<TemplateReaderStatus> {
  const credentials = await deps.credentials.find();
  return {
    configured: credentials !== null,
    userName: credentials?.userName ?? null,
    target: readerTarget(),
    revision: credentials?.revision ?? null,
    rotatedAt: credentials?.rotatedAt ?? null,
    validityDays: credentials?.validityDays ?? null,
    expiresAt: credentials?.expiresAt ?? null,
    envOverride: templateDatabaseUrl() !== undefined,
  };
}

export async function rotateTemplateReaderPassword(
  deps: TemplateReaderDependencies,
  actorId: string | null,
  validityDaysInput?: unknown,
): Promise<{ password: string; status: TemplateReaderStatus }> {
  const current = await deps.credentials.find();
  const validityDays = parseValidityDays(validityDaysInput, current?.validityDays ?? 0);
  const expiresAt = expiresAtFor(validityDays);
  const password = randomBytes(24).toString("hex");
  const saved = await deps.accounts.rotate({
    password,
    validUntil: expiresAt === null ? null : new Date(expiresAt),
    sealed: sealSecret(password),
    actorId,
    validityDays,
    expiresAt,
  });
  // Vérifie que le secret réellement stocké ouvre une connexion : détecte
  // immédiatement toute désynchronisation rôle ↔ secret.
  try {
    await deps.provisioner.testConnection(readerConnectionString(saved));
  } catch {
    throw new ValidationError(
      "Mot de passe appliqué mais connexion de lecture impossible ; relancez la rotation.",
    );
  }
  return { password, status: await getTemplateReaderStatus(deps) };
}

/** Applique une nouvelle durée au mot de passe courant, sans rotation. */
export async function updateTemplateReaderValidity(
  deps: TemplateReaderDependencies,
  actorId: string | null,
  validityDaysInput: unknown,
): Promise<TemplateReaderStatus> {
  const current = await deps.credentials.find();
  if (current === null) throw new ValidationError("Aucun compte de lecture configuré");
  const validityDays = parseValidityDays(validityDaysInput, current.validityDays);
  const expiresAt = expiresAtFor(validityDays);
  await deps.accounts.setValidity({
    validUntil: expiresAt === null ? null : new Date(expiresAt),
    validityDays,
    expiresAt,
    actorId,
  });
  return getTemplateReaderStatus(deps);
}

/**
 * Renouvelle le mot de passe s'il approche de l'échéance (7 jours max, ou un
 * tiers de la durée pour les durées courtes). Les identifiants restent en base.
 */
export async function ensureTemplateReaderFresh(
  deps: TemplateReaderDependencies,
): Promise<TemplateReaderCredentials | null> {
  const current = await deps.credentials.find();
  if (current === null || current.validityDays === 0 || current.expiresAt === null) {
    return current;
  }
  const remaining = Date.parse(current.expiresAt) - Date.now();
  const renewBeforeDays = Math.min(7, Math.max(0.5, current.validityDays / 3));
  if (remaining > renewBeforeDays * DAY_MS) return current;
  await rotateTemplateReaderPassword(deps, null, current.validityDays);
  return deps.credentials.find();
}

export async function testTemplateReaderConnection(
  deps: TemplateReaderDependencies,
): Promise<{ ok: true; user: string; source: "env" | "database" }> {
  const override = templateDatabaseUrl();
  if (override !== undefined) {
    return { ok: true, user: await deps.provisioner.testConnection(override), source: "env" };
  }
  const credentials = await deps.credentials.find();
  if (credentials === null) {
    throw new Error("Aucun compte de lecture configuré");
  }
  const user = await deps.provisioner.testConnection(readerConnectionString(credentials));
  return { ok: true, user, source: "database" };
}
