import { readFile } from "node:fs/promises";
import path from "node:path";
import { prepareAndPersistBuild } from "@/application/use-cases/standalone/prepare-and-persist-build";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage, standaloneBuildStorage } from "@/infrastructure/storage";

const intervalMs = Number(process.env.STANDALONE_WORKER_INTERVAL_MS ?? "5000");
if (!Number.isFinite(intervalMs) || intervalMs < 500) throw new Error("Intervalle worker invalide");

const runtimeDir = path.resolve("dist/standalone-runtime");
const [runtimeJs, runtimeCss] = await Promise.all([
  readFile(path.join(runtimeDir, "runtime.js")),
  readFile(path.join(runtimeDir, "runtime.css")),
]);
const pool = getPool();
const builds = pgStandaloneRepository(pool);
let stopping = false;

async function tick(): Promise<void> {
  const build = await builds.claimNextBuild();
  if (build === null) return;
  process.stdout.write(
    `${JSON.stringify({ message: "standalone_build_started", buildId: build.id })}\n`,
  );
  try {
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
        builds,
        ...(data === undefined ? {} : { data }),
        runtimeJs,
        runtimeCss,
      },
      { buildId: build.id },
    );
    process.stdout.write(`${JSON.stringify({ message: "standalone_build_ready", ...result })}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        message: "standalone_build_failed",
        buildId: build.id,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
}

process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});

while (!stopping) {
  try {
    await tick();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        message: "standalone_worker_tick_failed",
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

await pool.end();
