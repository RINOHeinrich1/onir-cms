#!/usr/bin/env node
// Hôte simulé (harness) — implémente le CÔTÉ HÔTE du contrat `onirtech.template-host.v1`
// avec des DONNÉES MOCK. AUCUNE connexion à un dashboard, une base, une API ou un
// secret : le développement d'un template est 100 % hors-ligne.
//
// Usage : node harness/host.mjs [--dir <dossier-du-template>] [--port 4500]

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
// `--dir` est relatif au répertoire courant (projet généré : `--dir .` depuis
// sa racine). Sans option, on sert le template de référence du kit.
const dirArg = opt("--dir", null);
const templateDir = dirArg
  ? resolve(process.cwd(), dirArg)
  : resolve(__dirname, "..", "template");
const port = Number(opt("--port", "4500"));

/**
 * Construit `ctx.params` : défauts du manifeste, puis surcharge par les valeurs
 * de la query string (`?titre=…`). Les clés non déclarées sont ignorées et les
 * valeurs sont coercées selon le type du paramètre (ADR-0024 §5.3).
 */
function buildParams(manifest, overrides = {}) {
  const declared = Array.isArray(manifest.params) ? manifest.params : [];
  const params = Object.fromEntries(declared.map((param) => [param.key, param.default]));
  for (const param of declared) {
    const raw = overrides[param.key];
    if (raw === undefined) continue;
    switch (param.type) {
      case "number": {
        const value = Number(raw);
        if (Number.isFinite(value)) params[param.key] = value;
        break;
      }
      case "boolean":
        params[param.key] = raw === "1" || raw === "true";
        break;
      case "select":
        if ((param.options ?? []).some((option) => option.value === raw)) {
          params[param.key] = raw;
        }
        break;
      default:
        params[param.key] = raw;
        break;
    }
  }
  return params;
}

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function hostPage(manifest, opts = {}) {
  const startChat = opts.phase === "chat";
  const consent = opts.consent === false
    ? null
    : { texte: "J'accepte la politique de confidentialité", lien: "https://example.com/confidentialite" };
  const ctx = {
    host: { protocol: "onirtech.template-host.v1", version: 1 },
    link: { type: "standard", label: "Campagne (mock)" },
    locale: "fr",
    brand: { name: "ONIRTECH (mock)", logoUrl: null },
    theme: { primary: "#023777" },
    consent,
    capabilities: manifest.capabilities,
    params: buildParams(manifest, opts.params),
    state: {
      phase: startChat ? "chat" : "identity",
      status: "en_cours",
      messages: startChat
        ? [{ id: "m0", role: "assistant", content: "Bonjour ! (phase « chat » au chargement — sas sauté)", medias: [], at: new Date().toISOString() }]
        : [],
      typing: false,
    },
    resources: {
      media: {
        photos: [
          { id: "p1", libelle: "Façade de l'entreprise", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='560'%3E%3Crect width='800' height='560' fill='%23023777'/%3E%3Ctext x='40' y='300' fill='white' font-size='46' font-family='sans-serif'%3Ep1%3C/text%3E%3C/svg%3E" },
          { id: "p2", libelle: "Équipe en réunion", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='560'%3E%3Crect width='800' height='560' fill='%23b45309'/%3E%3Ctext x='40' y='300' fill='white' font-size='46' font-family='sans-serif'%3Ep2%3C/text%3E%3C/svg%3E" },
          { id: "p3", libelle: "Salle de production", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='560'%3E%3Crect width='800' height='560' fill='%23065f46'/%3E%3Ctext x='40' y='300' fill='white' font-size='46' font-family='sans-serif'%3Ep3%3C/text%3E%3C/svg%3E" },
          { id: "p4", libelle: "Livraison / logistique", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='560'%3E%3Crect width='800' height='560' fill='%237c3aed'/%3E%3Ctext x='40' y='300' fill='white' font-size='46' font-family='sans-serif'%3Ep4%3C/text%3E%3C/svg%3E" },
        ],
        liens: [{ id: "l1", libelle: "Documentation (mock)", url: "https://example.com/doc" }],
      },
      modelForm: [{ name: "sujet", label: "Sujet", type: "text", required: true }],
    },
  };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Harness — ${manifest.id}</title>
<script type="importmap">
  { "imports": { "@onirtech/template-sdk": "/sdk/index.js" } }
</script>
<style>
  #mock-banner{position:fixed;inset:0 auto auto 0;width:100%;background:#FCAD28;color:#111;
    font:600 13px system-ui;padding:.35rem 1rem;text-align:center;z-index:99999}
  body{margin:0;padding-top:2rem;font-family:system-ui;background:#f8fafc}
</style></head><body>
<div id="mock-banner">HARNESS / MOCK — aucune connexion (les actions sont simulées)</div>
<div id="host"></div>
<script type="module">
  const manifest = ${JSON.stringify(manifest)};
  const ctx = ${JSON.stringify(ctx)};
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const listeners = new Map();
  const emit = (e, p) => (listeners.get(e) || new Set()).forEach((cb) => cb(p));

  const actions = {
    submitIdentity: (data) => {
      ctx.state.phase = "chat";
      ctx.state.messages = [
        { id: "m1", role: "assistant", content: "Bonjour " + data.nom + " ! Parlez-moi de votre projet.", medias: [], at: new Date().toISOString() },
      ];
      render();
    },
    sendMessage: (content) => {
      ctx.state.messages.push({ id: "u" + Date.now(), role: "user", content, medias: [], at: new Date().toISOString() });
      ctx.state.typing = true;
      render();
      setTimeout(() => {
        ctx.state.typing = false;
        ctx.state.messages.push({ id: "a" + Date.now(), role: "assistant", content: "(mock) Merci, noté : « " + content + " ».", medias: ctx.resources.media.photos.slice(0, 1), at: new Date().toISOString() });
        render();
      }, 600);
    },
    finish: () => { ctx.state.status = "finalisee"; render(); },
    request: async (cap) => (cap === "media" ? ctx.resources.media : cap === "modelForm" ? ctx.resources.modelForm : ctx.theme),
    openMedia: (url) => window.open(url, "_blank", "noopener"),
    resize: () => {},
  };
  const on = (event, cb) => { const s = listeners.get(event) || new Set(); s.add(cb); listeners.set(event, s); return () => s.delete(cb); };
  const live = () => ({ ...clone(ctx), actions, on });

  await import("/template/" + manifest.ui.entry.replace(/^\\.\\//, ""));
  const host = document.getElementById("host");
  let element = document.querySelector(manifest.ui.element);
  function render() {
    if (!element) { element = document.createElement(manifest.ui.element); host.replaceChildren(element); }
    element.onirtechContext = live();
    emit("state", ctx.state);
  }
  render();
</script></body></html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      const manifest = JSON.parse(await readFile(join(templateDir, "onirtech.template.json"), "utf8"));
      // Surcharge des paramètres déclarés via la query string (`?titre=…`).
      const params = {};
      for (const param of Array.isArray(manifest.params) ? manifest.params : []) {
        const value = url.searchParams.get(param.key);
        if (value !== null) params[param.key] = value;
      }
      const opts = {
        phase: url.searchParams.get("phase") || "identity",
        consent: url.searchParams.get("consent") !== "0",
        params,
      };
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(hostPage(manifest, opts));
      return;
    }
    // SDK copié dans `node_modules` du projet : le stack vanilla (sans build)
    // importe `@onirtech/template-sdk` via l'import map ci-dessus.
    if (url.pathname === "/sdk/index.js") {
      try {
        const file = join(
          templateDir,
          "node_modules",
          "@onirtech",
          "template-sdk",
          "dist",
          "index.js",
        );
        const data = await readFile(file);
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(data);
      } catch {
        res
          .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
          .end("SDK non installé : lancez « npm install » dans le projet.");
      }
      return;
    }
    if (url.pathname.startsWith("/template/")) {
      const rel = normalize(url.pathname.slice("/template/".length));
      if (rel.startsWith("..")) {
        res.writeHead(400).end("bad path");
        return;
      }
      const file = join(templateDir, rel);
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(data);
      return;
    }
    res.writeHead(404).end("not found");
  } catch {
    res.writeHead(500).end("error");
  }
});

server.listen(port, () => {
  console.log(`Harness (hôte simulé) — http://localhost:${port}`);
  console.log(`Template : ${templateDir}`);
  console.log("MOCK / aucune connexion à la prod.");
});
