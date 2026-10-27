#!/usr/bin/env node
// CLI du kit : `onirtech-template validate <dir>` et `onirtech-template pack <dir>`.
// `pack` synchronise l'intégrité SRI de l'entrée puis produit l'archive ZIP
// `.onirtech-template` + un `release.json` (SHA-256).
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

const HOST_PROTOCOL = "onirtech.template-host.v1";
const SKIP = new Set(["node_modules", ".git", "release", ".DS_Store"]);

const [cmd, dirArg] = process.argv.slice(2);
const dir = join(process.cwd(), dirArg ?? ".");
if (!["validate", "pack"].includes(cmd)) {
  console.error("Usage : onirtech-template <validate|pack> <dir>");
  process.exit(1);
}

const sri = (buf) => `sha256-${createHash("sha256").update(buf).digest("base64")}`;
const hex = (buf) => createHash("sha256").update(buf).digest("hex");

const loadManifest = async () =>
  JSON.parse(await readFile(join(dir, "onirtech.template.json"), "utf8"));
const loadEntry = async (manifest) => readFile(join(dir, manifest.ui.entry.replace(/^\.\//, "")));
const loadWidgetEntry = async (manifest) =>
  manifest.ui.widget === undefined
    ? null
    : readFile(join(dir, manifest.ui.widget.entry.replace(/^\.\//, "")));

const PARAM_TYPES = ["string", "text", "number", "boolean", "color", "url", "select"];
const PARAM_KEY = /^[a-z][a-z0-9_]{1,40}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_PARAMS = 40;
const MAX_PARAMS_BYTES = 16 * 1024;
const MAX_PARAM_STRING = 2000;

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** Contrôle du bloc `params` (ADR-0023) — mêmes règles que le cœur. */
function checkParams(params) {
  const errors = [];
  if (params === undefined) return errors;
  if (!Array.isArray(params)) return ["params doit être une liste"];
  if (params.length > MAX_PARAMS) errors.push(`params : au plus ${MAX_PARAMS} entrées`);
  if (Buffer.byteLength(JSON.stringify(params)) > MAX_PARAMS_BYTES) {
    errors.push(`params : dépasse ${MAX_PARAMS_BYTES} octets`);
  }
  const seen = new Set();
  params.forEach((param, index) => {
    const at = `params[${index}]`;
    if (param === null || typeof param !== "object" || Array.isArray(param)) {
      errors.push(`${at} : objet attendu`);
      return;
    }
    if (typeof param.key !== "string" || !PARAM_KEY.test(param.key)) {
      errors.push(`${at}.key : ^[a-z][a-z0-9_]{1,40}$`);
    } else if (seen.has(param.key)) {
      errors.push(`${at}.key : dupliquée (${param.key})`);
    } else {
      seen.add(param.key);
    }
    if (typeof param.label !== "string" || param.label.trim() === "" || param.label.length > 80) {
      errors.push(`${at}.label : requis (1..80)`);
    }
    if (param.description !== undefined && typeof param.description !== "string") {
      errors.push(`${at}.description : chaîne attendue`);
    } else if (typeof param.description === "string" && param.description.length > 200) {
      errors.push(`${at}.description : 200 caractères maximum`);
    }
    if (!PARAM_TYPES.includes(param.type)) {
      errors.push(`${at}.type : ${PARAM_TYPES.join(" | ")}`);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(param, "default")) {
      errors.push(`${at}.default : valeur par défaut obligatoire`);
      return;
    }
    const value = param.default;
    const maxLength = param.maxLength ?? 200;
    switch (param.type) {
      case "string":
      case "text":
        if (typeof value !== "string") errors.push(`${at}.default : chaîne attendue`);
        else if (value.length > maxLength) errors.push(`${at}.default : plus long que maxLength`);
        if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > MAX_PARAM_STRING) {
          errors.push(`${at}.maxLength : entier 1..${MAX_PARAM_STRING}`);
        }
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`${at}.default : nombre fini attendu`);
        } else {
          if (param.min !== undefined && (typeof param.min !== "number" || value < param.min)) {
            errors.push(`${at}.min : nombre fini ≤ défaut`);
          }
          if (param.max !== undefined && (typeof param.max !== "number" || value > param.max)) {
            errors.push(`${at}.max : nombre fini ≥ défaut`);
          }
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${at}.default : booléen attendu`);
        break;
      case "color":
        if (typeof value !== "string" || !COLOR.test(value)) {
          errors.push(`${at}.default : #rrggbb attendu`);
        }
        break;
      case "url":
        if (typeof value !== "string" || !isHttpUrl(value)) {
          errors.push(`${at}.default : URL http(s) attendue`);
        }
        break;
      case "select": {
        if (!Array.isArray(param.options) || param.options.length === 0) {
          errors.push(`${at}.options : au moins une option`);
          break;
        }
        if (param.options.length > 40) errors.push(`${at}.options : 40 maximum`);
        const values = new Set();
        for (const option of param.options) {
          if (option === null || typeof option !== "object" || typeof option.value !== "string" || option.value === "") {
            errors.push(`${at}.options : { value, label } attendus`);
            continue;
          }
          if (values.has(option.value)) errors.push(`${at}.options : valeur dupliquée ${option.value}`);
          values.add(option.value);
        }
        if (typeof value !== "string" || !values.has(value)) {
          errors.push(`${at}.default : doit être l'une des options`);
        }
        break;
      }
    }
  });
  return errors;
}

function checkManifest(m, entryBuf, widgetEntryBuf) {
  const errors = [];
  if (m.schemaVersion !== 1) errors.push("schemaVersion doit valoir 1");
  if (m.kind !== "template") errors.push('kind doit valoir "template"');
  if (m.compatibility?.hostProtocol !== HOST_PROTOCOL) errors.push(`hostProtocol ≠ ${HOST_PROTOCOL}`);
  errors.push(...checkParams(m.params));
  if (m.publisher?.trustLevel === "community" && m.ui?.mode === "web-component") {
    errors.push("un template community ne peut pas utiliser ui.mode web-component (→ iframe)");
  }
  if (entryBuf) {
    const entry = entryBuf.toString("utf8");
    if (!entry.includes(m.ui.element)) errors.push(`entry n'enregistre pas l'élément ${m.ui.element}`);
    if (sri(entryBuf) !== m.ui.integrity) errors.push("intégrité désynchronisée (lancez `pack`)");
  }
  if (m.ui.widget !== undefined && widgetEntryBuf) {
    const entry = widgetEntryBuf.toString("utf8");
    if (!entry.includes(m.ui.widget.element)) {
      errors.push(`entry widget n'enregistre pas l'élément ${m.ui.widget.element}`);
    }
    if (sri(widgetEntryBuf) !== m.ui.widget.integrity) {
      errors.push("intégrité widget désynchronisée (lancez `pack`)");
    }
  }
  if (m.ui.widget !== undefined && !widgetEntryBuf) {
    errors.push("entry widget introuvable");
  }
  return errors;
}

async function walk(root) {
  const out = [];
  for (const name of await readdir(root)) {
    if (SKIP.has(name)) continue;
    const full = join(root, name);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const manifest = await loadManifest();
const entryBuf = await loadEntry(manifest).catch(() => null);
const widgetEntryBuf = await loadWidgetEntry(manifest).catch(() => null);

if (cmd === "validate") {
  const errors = checkManifest(manifest, entryBuf, widgetEntryBuf);
  if (errors.length) {
    console.error(`✗ Manifeste invalide :\n - ${errors.join("\n - ")}`);
    process.exit(1);
  }
  console.log(`✓ ${manifest.id}@${manifest.version} valide (${manifest.ui.mode}).`);
  process.exit(0);
}

if (entryBuf) {
  manifest.ui.integrity = sri(entryBuf);
}
if (widgetEntryBuf && manifest.ui.widget !== undefined) {
  manifest.ui.widget.integrity = sri(widgetEntryBuf);
}
await writeFile(join(dir, "onirtech.template.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const errors = checkManifest(manifest, entryBuf, widgetEntryBuf);
if (errors.length) {
  console.error(`✗ ${errors.join(" ; ")}`);
  process.exit(1);
}
const files = await walk(dir);
const zipInput = {};
for (const file of files) {
  zipInput[relative(dir, file).split(sep).join("/")] = new Uint8Array(await readFile(file));
}
const zip = zipSync(zipInput);
const outDir = join(dir, "release");
await mkdir(outDir, { recursive: true });
const name = `${manifest.id}-${manifest.version}`;
const archive = join(outDir, `${name}.onirtech-template`);
await writeFile(archive, zip);
const sha = hex(Buffer.from(zip));
await writeFile(
  join(outDir, `${name}.release.json`),
  `${JSON.stringify({ id: manifest.id, version: manifest.version, hostProtocol: HOST_PROTOCOL, sha256: sha, files: files.map((f) => relative(dir, f).split(sep).join("/")) }, null, 2)}\n`,
);
console.log(`✓ Archive : ${archive}`);
console.log(`  sha256 : ${sha}`);
console.log("  → importez cette archive dans le panneau (Templates visuels).");
