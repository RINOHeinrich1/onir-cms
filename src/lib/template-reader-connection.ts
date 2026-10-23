import type { TemplateReaderCredentials } from "@/application/ports/template-reader-credentials-repository";
import { databaseUrl } from "@/lib/env";
import { openSecret } from "@/lib/secret-box";

/** Cible lisible (hôte + base) du compte de lecture. */
export function readerTarget(): string {
  const url = new URL(databaseUrl());
  return `${url.host}${url.pathname}`;
}

/** URL de connexion du rôle lecture, dérivée de DATABASE_URL (même base). */
export function readerConnectionString(credentials: TemplateReaderCredentials): string {
  const url = new URL(databaseUrl());
  url.username = credentials.userName;
  url.password = openSecret(credentials.sealed);
  return url.toString();
}
