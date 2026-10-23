#!/usr/bin/env node
// `npm run dev` d'un template React/Vue (ADR-0024 §11) : harness MOCK + build
// Vite en `--watch`, sans dépendance supplémentaire (pas de `concurrently`).
//
// Le harness sert le bundle (`dist/index.js`) : le premier build doit donc
// avoir produit un fichier. Vite `--watch` reconstruit à chaque édition ;
// rechargez la page après un rebuild (pas de HMR, ADR §13).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");

if (!existsSync(viteBin)) {
  console.error(
    `[dev] Vite introuvable (${viteBin}). Lancez « npm install » avant « npm run dev ».`,
  );
  process.exit(1);
}

/** Enfants lancés : harness puis build watch. */
const children = [
  spawn(process.execPath, ["harness/host.mjs", "--dir", "."], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(process.execPath, [viteBin, "build", "--watch"], {
    cwd: root,
    stdio: "inherit",
  }),
];

let stopping = false;

/** Arrête proprement les deux processus (SIGINT/SIGTERM ou sortie anormale). */
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGINT");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping && signal === null && code !== 0) stop(code ?? 1);
  });
}
