import { formatLegacyMigrationResult, migrateLegacyChatbot } from "./migrate-legacy-chatbot";
import { getPool } from "./pool";

const arg = process.argv.find((value) => value.startsWith("--link-id="));
const linkId = arg?.slice("--link-id=".length).trim() ?? "";
if (linkId === "") {
  process.stderr.write("--link-id=<uuid> est obligatoire\n");
  process.exitCode = 1;
} else {
  const pool = getPool();
  migrateLegacyChatbot(pool, linkId, {
    allowOpenConversations: process.argv.includes("--allow-open"),
  })
    .then((result) => {
      process.stdout.write(
        process.argv.includes("--format=json")
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${formatLegacyMigrationResult(result)}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(`Échec de la migration legacy : ${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
