import { backupDatabase } from "./backup-database";

backupDatabase().catch((error: unknown) => {
  process.stderr.write(`Échec de la sauvegarde : ${String(error)}\n`);
  process.exitCode = 1;
});
