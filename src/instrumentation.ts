/**
 * Démarrage des workers applicatifs (ADR-0035).
 * Next.js appelle `register()` au démarrage du serveur Node, une seule fois.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initAppSecrets, startAppSecretsRefresh } = await import(
    "@/infrastructure/config/app-secrets"
  );
  await initAppSecrets();
  startAppSecretsRefresh();
  const { startWebhookWorker } = await import("@/infrastructure/webhooks/worker");
  startWebhookWorker();
}
