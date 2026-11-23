import { readFile } from "node:fs/promises";
import path from "node:path";
import { prepareAndPersistBuild } from "@/application/use-cases/standalone/prepare-and-persist-build";
import { ensureAppSecretsLoaded } from "@/infrastructure/config/app-secrets";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage, standaloneBuildStorage } from "@/infrastructure/storage";

async function main(): Promise<void> {
  const buildId = process.argv[2]?.trim();
  if (buildId === undefined || buildId === "") {
    throw new Error("Usage : npm run build:standalone -- <buildId>");
  }

  const runtimeDir = path.resolve("dist/standalone-runtime");
  const [runtimeJs, runtimeCss] = await Promise.all([
    readFile(path.join(runtimeDir, "runtime.js")),
    readFile(path.join(runtimeDir, "runtime.css")),
  ]);

  const pool = getPool();
  await ensureAppSecretsLoaded();
  const data = await tryTemplateDataDependencies(pool);
  const result = await prepareAndPersistBuild(
    {
      links: pgChatLinkRepository(pool),
      templates: pgVisualTemplateRepository(pool),
      medias: pgMediaRepository(pool),
      configs: pgChatbotConfigRepository(pool),
      confidentialites: pgConfidentialiteRepository(pool),
      mediaStorage: mediaStorage(),
      buildStorage: standaloneBuildStorage(),
      builds: pgStandaloneRepository(pool),
      ...(data === undefined ? {} : { data }),
      runtimeJs,
      runtimeCss,
    },
    { buildId },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end();
  });
