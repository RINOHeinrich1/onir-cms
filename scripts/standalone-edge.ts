import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { standaloneBuildStorage } from "@/infrastructure/storage";
import { appUrl } from "@/lib/env";
import { createStandaloneEdgeServer } from "@/standalone/edge-server";

const port = Number(process.env.STANDALONE_EDGE_PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("STANDALONE_EDGE_PORT invalide");
}

const pool = getPool();
const server = createStandaloneEdgeServer({
  mappings: pgStandaloneRepository(pool),
  storage: standaloneBuildStorage(),
  apiOrigin: appUrl(),
  logger: (message, detail) => {
    process.stdout.write(`${JSON.stringify({ message, ...detail })}\n`);
  },
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Standalone edge listening on ${port}\n`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
