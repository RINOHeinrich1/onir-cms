import { getPool } from "./pool";
import { seedAdmin } from "./seed-admin";

const pool = getPool();

seedAdmin()
  .then((result) => {
    const summary = result.created
      ? `Administrateur créé : ${result.email} (super-admin, rotation forcée)`
      : `Administrateur déjà présent : ${result.email}`;
    process.stdout.write(`${summary}\n`);
  })
  .catch((error: unknown) => {
    process.stderr.write(`Échec du seed : ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
