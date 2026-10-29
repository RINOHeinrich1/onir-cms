import { auditLegacyChatbots, formatLegacyChatbotAudit } from "./audit-legacy-chatbots";
import { getPool } from "./pool";

const pool = getPool();
auditLegacyChatbots(pool)
  .then((result) => {
    process.stdout.write(
      process.argv.includes("--format=json")
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${formatLegacyChatbotAudit(result)}\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(`Échec de l'audit legacy : ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
