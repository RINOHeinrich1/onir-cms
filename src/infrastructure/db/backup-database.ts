import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { databaseUrl } from "@/lib/env";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Dump PostgreSQL au format custom avant une opération destructive.
 * `pg_dump` doit être présent dans l'image de maintenance.
 */
export async function backupDatabase(): Promise<string> {
  const dir = process.env.BACKUP_DIR ?? "/backups";
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `onir-cms-${stamp()}.dump`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--file", file, databaseUrl()],
      { env: process.env, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump a échoué (${code}) : ${stderr.trim()}`));
    });
  });

  process.stdout.write(`Sauvegarde créée : ${file}\n`);
  return file;
}
