/**
 * Génération et vérification des clés d'API server-to-server.
 * Format : `onir_live_<identifiant_public>.<secret>`.
 * Le secret est haché avec scrypt + sel ; seul le hash est stocké.
 */

import {
  randomBytes,
  type ScryptOptions,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export const API_KEY_PREFIX = "onir_live_";
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

export type GeneratedApiKey = {
  token: string;
  prefix: string;
  secret: string;
};

export type ParsedApiKey = {
  prefix: string;
  secret: string;
};

export function generateApiKey(): GeneratedApiKey {
  const publicId = randomBytes(9).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const prefix = `${API_KEY_PREFIX}${publicId}`;
  return { token: `${prefix}.${secret}`, prefix, secret };
}

export function parseApiKey(token: string): ParsedApiKey | null {
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  const separator = token.indexOf(".");
  if (separator <= API_KEY_PREFIX.length || separator === token.length - 1) return null;
  const prefix = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (prefix.length > 80 || secret.length < 20) return null;
  return { prefix, secret };
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(secret, salt, KEY_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  })) as Buffer;
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyApiKeySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (n !== SCRYPT_COST || r !== SCRYPT_BLOCK_SIZE || p !== SCRYPT_PARALLELIZATION) return false;
  if (saltHex === undefined || hashHex === undefined) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(secret, salt, expected.length, { N: n, r, p })) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
