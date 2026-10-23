import type { Pool } from "pg";
import { TemplateQueryError } from "@/application/ports/template-query-executor";
import type { TemplateDataDependencies } from "@/application/use-cases/visual-templates/load-template-data";
import { ensureTemplateReaderFresh } from "@/application/use-cases/visual-templates/manage-template-reader";
import { templateDatabaseUrl } from "@/lib/env";
import { readerConnectionString, readerTarget } from "@/lib/template-reader-connection";
import { pgTemplateDataAuditRepository } from "./template-data-audit-repository";
import { pgTemplateDataBindingRepository } from "./template-data-binding-repository";
import {
  createTemplateQueryExecutor,
  type TemplateQueryExecutorHandle,
} from "./template-query-executor";
import { pgTemplateReaderAccountStore } from "./template-reader-account-store";
import { pgTemplateReaderCredentialsRepository } from "./template-reader-credentials-repository";
import { withTemplateReaderLock } from "./template-reader-lock";
import { pgTemplateReaderProvisioner } from "./template-reader-provisioner";

type Cached = { key: string; executor: TemplateQueryExecutorHandle };

const globalRef = globalThis as typeof globalThis & {
  __onirtechTemplateExecutor?: Cached;
};

/**
 * Exécuteur partagé. Source de connexion : `TEMPLATE_DATABASE_URL` (surcharge
 * d'exploitation) sinon les identifiants chiffrés gérés par le panneau.
 * Un changement de `revision` (rotation) reconstruit le pool.
 */
export async function getTemplateDataExecutor(pool: Pool): Promise<TemplateQueryExecutorHandle> {
  const override = templateDatabaseUrl();
  let key: string;
  let connectionString: string;

  if (override !== undefined) {
    key = `env:${override}`;
    connectionString = override;
  } else {
    const credentials = await withTemplateReaderLock(pool, () =>
      ensureTemplateReaderFresh({
        credentials: pgTemplateReaderCredentialsRepository(pool),
        provisioner: pgTemplateReaderProvisioner(pool),
        accounts: pgTemplateReaderAccountStore(pool),
      }),
    );
    if (credentials === null) {
      throw new TemplateQueryError(
        "DATA_PROVIDER_ERROR",
        "Compte de lecture non configuré (panneau Templates visuels → Données)",
      );
    }
    key = `db:${credentials.revision}:${credentials.userName}:${readerTarget()}`;
    connectionString = readerConnectionString(credentials);
  }

  if (globalRef.__onirtechTemplateExecutor?.key === key) {
    return globalRef.__onirtechTemplateExecutor.executor;
  }
  const previous = globalRef.__onirtechTemplateExecutor;
  const executor = createTemplateQueryExecutor({ connectionString });
  globalRef.__onirtechTemplateExecutor = { key, executor };
  if (previous !== undefined) void previous.executor.close();
  return executor;
}

export async function templateDataDependencies(pool: Pool): Promise<TemplateDataDependencies> {
  return {
    bindings: pgTemplateDataBindingRepository(pool),
    executor: await getTemplateDataExecutor(pool),
    audit: pgTemplateDataAuditRepository(pool),
  };
}

/** Dépendances optionnelles : absentes si aucun compte de lecture n'est configuré. */
export async function tryTemplateDataDependencies(
  pool: Pool,
): Promise<TemplateDataDependencies | undefined> {
  try {
    return await templateDataDependencies(pool);
  } catch {
    return undefined;
  }
}
