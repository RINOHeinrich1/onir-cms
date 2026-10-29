import { getPool } from "./pool";
import { resetChatbotTestData } from "./reset-chatbot-test-data";

const pool = getPool();

resetChatbotTestData(process.argv.includes("--execute"))
  .catch((error: unknown) => {
    process.stderr.write(`Échec de la réinitialisation : ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
