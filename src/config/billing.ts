/**
 * Configuration billing figée au build.
 * Les valeurs sont injectées par `next.config.ts` depuis les variables de build.
 */
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
export const BILLING_PORTAL_URL = process.env.BILLING_PORTAL_URL ?? "";
export const BILLING_API_URL = process.env.BILLING_API_URL ?? "";
