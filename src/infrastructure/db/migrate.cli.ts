import { migrate } from "./migrate";
import { getPool } from "./pool";

const pool = getPool();

migrate()
  .then((applied) => {
    const summary =
      applied.length > 0
        ? `Migrations appliquées : ${applied.join(", ")}`
        : "Aucune migration à appliquer.";
    process.stdout.write(`${summary}\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(`Échec des migrations : ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
