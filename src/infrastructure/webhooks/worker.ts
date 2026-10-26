import { processWebhookDelivery } from "@/application/use-cases/webhooks/process-webhook-delivery";
import type { WebhookExecutionDependencies } from "@/application/use-cases/webhooks/trigger-webhook";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgWebhookDeliveryRepository } from "@/infrastructure/db/webhook-delivery-repository";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { httpWebhookSender } from "@/infrastructure/webhooks/http-sender";
import { webhookWorkerEnabled } from "@/lib/env";

const POLL_MS = 3000;
const CONCURRENCY = 2;

let started = false;
let running = false;
let lastPurge = 0;

function dependencies(): WebhookExecutionDependencies {
  const pool = getPool();
  return {
    endpoints: pgWebhookEndpointRepository(pool),
    deliveries: pgWebhookDeliveryRepository(pool),
    templates: pgChatTemplateRepository(pool),
    fiches: pgFicheRepository(pool),
    prospects: pgProspectRepository(pool),
    attachments: pgAttachmentRepository(pool),
    storage: attachmentStorage(),
    sender: httpWebhookSender(),
  };
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const deps = dependencies();
    if (Date.now() - lastPurge > 24 * 60 * 60 * 1000) {
      lastPurge = Date.now();
      await deps.deliveries.purgeOlderThan(30).catch(() => undefined);
    }
    for (let index = 0; index < CONCURRENCY; index += 1) {
      const delivery = await deps.deliveries.claimNext();
      if (delivery === null) break;
      await processWebhookDelivery(deps, delivery);
    }
  } catch (error) {
    process.stderr.write(`[webhooks] worker : ${String(error)}\n`);
  } finally {
    running = false;
  }
}

/** Démarre le worker in-process (idempotent, désactivable en test). */
export function startWebhookWorker(): void {
  if (started || !webhookWorkerEnabled()) return;
  started = true;
  const timer = setInterval(() => {
    void tick();
  }, POLL_MS);
  timer.unref();
  void tick();
}

/** Exécute un tick unique (tests / diagnostic). */
export async function runWebhookWorkerOnce(): Promise<void> {
  await tick();
}
