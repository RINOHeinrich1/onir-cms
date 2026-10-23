#!/usr/bin/env node
// Contrôle de flux du template immersif (harnais MOCK, aucune production).
//
// Scénarios : entry | book | discussion | outside | mobile | remount | longmsg | finish | all
// Mesure les phases (timings), la pagination, la mémoire GPU et applique les
// budgets du plan de refactorisation (draw calls, triangles, textures,
// géométries, timings, pages). Écrit un JSON de baseline avec
// `--write-baseline=<fichier>` et compare avec `--baseline=<fichier>`.
//
// Usage :
//   node bin/test-immersive-flow.mjs --scenario=entry
//   node bin/test-immersive-flow.mjs --scenario=all --baseline=template-immersive/docs/baseline-4.24.1.json
//   node bin/test-immersive-flow.mjs --write-baseline=template-immersive/docs/baseline-4.24.1.json

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { findChrome, kitRoot, launchChromium, loadPlaywright, startHarness } from "./lib/browser.mjs";

const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : def;
};
const has = (name) => argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));

const SCENARIO = arg("scenario", "all");
const PORT = Number(arg("port", 4701));
const OUT_DIR = resolve(arg("out", "/tmp/opencode/immersive-flow"));
const BASELINE = arg("baseline", null);
const WRITE_BASELINE = arg("write-baseline", null);
const JSON_MODE = has("json");
const TEMPLATE_DIR = resolve(arg("dir", join(kitRoot, "template-immersive")));

const log = (...a) => (JSON_MODE ? console.error(...a) : console.log(...a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Résultats / checks
// ---------------------------------------------------------------------------
const results = [];
function scenarioResult(name) {
  const r = { name, status: "PASS", checks: [], timings: {}, pages: {}, metrics: null };
  results.push(r);
  return r;
}
function check(res, label, ok, detail = "") {
  res.checks.push({ label, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) res.status = "FAIL";
  return ok;
}
function skip(res, label, detail = "") {
  res.checks.push({ label, status: "SKIP", detail });
}

// ---------------------------------------------------------------------------
// Helpers DOM (shadow root ouvert du custom element)
// ---------------------------------------------------------------------------
const HOST = "onirtech-template-immersive";

async function waitShadow(page, fn, label, timeout = 60000) {
  try {
    await page.waitForFunction(fn, null, { timeout, polling: 100 });
  } catch (e) {
    throw new Error(`${label} — ${e.message.split("\n")[0]}`);
  }
}
const shadowHas = (selector) => {
  const h = document.querySelector("onirtech-template-immersive");
  return !!h?.shadowRoot?.querySelector(selector);
};
const waitSelector = (page, selector, label, timeout) =>
  page.waitForFunction((sel) => !!document.querySelector("onirtech-template-immersive")?.shadowRoot?.querySelector(sel), selector, { timeout, polling: 100 })
    .catch((e) => { throw new Error(`${label} — ${e.message.split("\n")[0]}`); });

async function shadowEval(page, fn, arg = null) {
  return page.evaluate(({ src, arg }) => {
    const host = document.querySelector("onirtech-template-immersive");
    // eslint-disable-next-line no-new-func
    return new Function("sr", "host", "arg", `return (${src})(sr, host, arg);`)(host?.shadowRoot, host, arg);
  }, { src: fn.toString(), arg });
}

async function folio(page) {
  return shadowEval(page, (sr) => sr?.querySelector(".page.right .folio")?.textContent?.trim() || "");
}
async function waitFolio(page, label, timeout = 60000) {
  await waitShadow(page, () => {
    const t = document.querySelector("onirtech-template-immersive")?.shadowRoot?.querySelector(".page.right .folio")?.textContent?.trim() || "";
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
    return m !== null && Number(m[2]) > 0;
  }, label, timeout);
  return folio(page);
}
const pageTotal = (text) => Number(String(text).split("/")[1]?.trim() || 0);
const pageCurrent = (text) => Number(String(text).split("/")[0]?.trim() || 0);

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------
async function measureP95(page) {
  return page.evaluate(async () => {
    const o = window.__onirtech;
    if (!o?.renderer) return { software: null, p95: null, gpu: "hook absent" };
    let gpu = "";
    try {
      const gl = o.renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    } catch { /* ignore */ }
    const software = /swiftshader|llvmpipe|software/i.test(gpu);
    if (software) return { software: true, p95: null, gpu: gpu.slice(0, 60) };
    const ts = [];
    let last = performance.now();
    await new Promise((res) => {
      function tick(now) {
        ts.push(now - last);
        last = now;
        if (ts.length < 120) requestAnimationFrame(tick);
        else res();
      }
      requestAnimationFrame(tick);
    });
    ts.sort((a, b) => a - b);
    return { software: false, p95: ts[Math.floor(ts.length * 0.95)] ?? null, gpu: gpu.slice(0, 60) };
  });
}

async function renderMetrics(page) {
  return page.evaluate(() => {
    const o = window.__onirtech;
    if (!o?.renderer) return null;
    const info = o.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
    };
  });
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------
async function goto(page, query) {
  await page.goto(`http://127.0.0.1:${PORT}/?${query}`, { waitUntil: "load", timeout: 60000 });
}

async function waitActions(page, timeout = 60000) {
  await waitSelector(page, ".actions.show", "barre d'actions visible", timeout);
}

async function shot(page, name) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  log(`  capture : ${file}`);
  return file;
}

/** Vérifie les invariants de la machine exposés par `?debug=1`. */
async function checkMachineInvariants(page, res, label) {
  await sleep(350);
  const violations = await page.evaluate(() => window.__onirtech?.__invariants ?? window.__onirtech?.__metrics?.invariants ?? null);
  if (Array.isArray(violations)) check(res, `invariants machine (${label})`, violations.length === 0, violations.join(" ; ") || "ok");
  else skip(res, `invariants machine (${label})`, "__metrics indisponible");
}

async function runEntry(page, res) {
  // Viewport réduit : le rendu logiciel (CI) est lent ; la mise en page du sas
  // reste représentative et les timings sont comparés à la même baseline.
  await page.setViewportSize({ width: 640, height: 400 });
  await goto(page, "phase=identity&consent=1&debug=1");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !!(sr?.querySelector(".entry.show") && sr.querySelector('input[type="email"]'));
  }, "formulaire du sas");
  check(res, "formulaire du sas", true);
  await shot(page, "entry-01-form");

  await page.locator(`${HOST} .entry input[type="text"]`).fill("Baseline");
  await page.locator(`${HOST} .entry input[type="email"]`).fill("baseline@example.com");
  await page.locator(`${HOST} .entry .check input[type="checkbox"]`).check();
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return sr?.querySelector('.form button[type="submit"]')?.disabled === false;
  }, "bouton d'entrée actif");

  // Horloge côté page : mesure indépendante de la latence Playwright.
  await page.evaluate(() => {
    window.__flowReadyMs = null;
    const host = document.querySelector("onirtech-template-immersive");
    const observer = new MutationObserver(() => {
      if (host.getAttribute("data-onirtech-ready") === "1" && window.__flowReadyMs == null) {
        window.__flowReadyMs = performance.now() - window.__flowT0;
        observer.disconnect();
      }
    });
    observer.observe(host, { attributes: true, attributeFilter: ["data-onirtech-ready"] });
    window.__flowT0 = performance.now();
  });

  const t0 = Date.now();
  await page.locator(`${HOST} .entry .form button[type="submit"]`).click();
  await waitActions(page, 60000);
  const entryToActions = Date.now() - t0;

  const readyAttr = await page.locator(HOST).getAttribute("data-onirtech-ready");
  const entryToReady = await page.evaluate(() => (window.__flowReadyMs == null ? null : Math.round(window.__flowReadyMs)));
  res.timings.entryToActions = entryToActions;
  res.timings.entryToReady = null; // `onirtech-ready` peut précéder le sas (assets prêts)

  const formGone = await shadowEval(page, (sr) => !sr?.querySelector(".entry.show"));
  check(res, "formulaire refermé", formGone);
  check(res, "barre d'actions visible", true, `${entryToActions} ms après soumission`);
  check(res, "onirtech-ready", readyAttr === "1", readyAttr === "1" ? `attribut posé (${entryToReady ?? "?"} ms)` : "attribut absent");
  const canvasCount = await shadowEval(page, (sr) => sr?.querySelectorAll("canvas").length ?? 0);
  check(res, "un seul canvas", canvasCount === 1, `${canvasCount} canvas`);
  await checkMachineInvariants(page, res, "salle");
  await shot(page, "entry-02-room");
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function runBook(page, res) {
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);
  await shot(page, "book-01-room");

  const t0 = Date.now();
  await page.locator(`${HOST} .actions.show .act-album`).click();
  await waitSelector(page, ".bookov.open", "livre ouvert", 60000);
  const bookOpen = Date.now() - t0;
  res.timings.bookOpen = bookOpen;
  await waitFolio(page, "pagination desktop");
  await sleep(1200); // fin de l'ouverture de couverture
  const first = await folio(page);
  const desktopTotal = pageTotal(first);
  res.pages.desktop = desktopTotal;
  check(res, "livre ouvert", true, `${bookOpen} ms · ${desktopTotal} pages (desktop)`);
  check(res, "pagination desktop", desktopTotal > 0, `${first}`);
  await checkMachineInvariants(page, res, "livre");
  await shot(page, "book-02-cover");

  await page.locator(`${HOST} .bnav.next`).click();
  await sleep(1200);
  const second = await folio(page);
  check(res, "page suivante", pageCurrent(second) === Math.min(2, desktopTotal), second);
  await page.locator(`${HOST} .bnav.prev`).click();
  await sleep(1200);
  const back = await folio(page);
  check(res, "page précédente", pageCurrent(back) === 1, back);

  // Lecteur (zoom) depuis la page de droite.
  // NB 4.24.1 : `#paint()` remplace la page de droite par `#renderPage()`, qui
  // ne reporte pas le handler `zoom` de `#rightPhoto`. Le lecteur reste donc
  // inatteignable à l'écran — comportement existant, caractérisé ici en SKIP.
  const hasPhoto = (await page.locator(`${HOST} .page.right .photo`).count()) > 0;
  if (!hasPhoto) {
    skip(res, "lecteur zoom", "page sans image (ressource de données)");
  }
  let readerOpen = false;
  if (hasPhoto) {
    await page.locator(`${HOST} .page.right .photo`).click();
    try {
      await waitSelector(page, ".reader.open", "lecteur ouvert", 3000);
      readerOpen = true;
    } catch { /* lecteur non atteignable (4.24.1) */ }
  }
  if (readerOpen) {
    check(res, "lecteur zoom", true);
    await shot(page, "book-03-reader");
    await page.keyboard.press("ArrowRight");
    await sleep(850);
    await page.keyboard.press("Escape");
    await waitShadow(page, () => {
      const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
      return !sr?.querySelector(".reader.open");
    }, "lecteur fermé", 5000);
    check(res, "lecteur fermé (Escape)", true);
  } else if (hasPhoto) {
    skip(res, "lecteur zoom", "non atteignable en 4.24.1 (photo rendue sans handler) — dette documentée");
  }

  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".bookov.open");
  }, "livre refermé", 5000);
  check(res, "livre refermé (Escape)", true);

  // Mode portrait : une seule page.
  await page.setViewportSize({ width: 480, height: 800 });
  await sleep(300);
  await waitActions(page);
  await page.locator(`${HOST} .actions.show .act-album`).click();
  await waitSelector(page, ".bookov.open.single", "livre single", 60000);
  await waitFolio(page, "pagination single");
  await sleep(1200);
  const single = await folio(page);
  const singleTotal = pageTotal(single);
  res.pages.single = singleTotal;
  check(res, "livre single ≤ 600 px", true, `${singleTotal} pages (single)`);
  await shot(page, "book-04-single");
  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".bookov.open");
  }, "livre single refermé", 5000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(300);

  // Mesures GPU + frame time (p95 seulement si matériel).
  const metrics = await renderMetrics(page);
  res.metrics = { ...(metrics || {}), ...(await measureP95(page)) };
  if (metrics) {
    check(res, "draw calls", metrics.calls <= 150, `${metrics.calls} (max 150)`);
    check(res, "triangles", metrics.triangles <= 400000, `${metrics.triangles} (max 400 000)`);
  } else {
    skip(res, "métriques GPU", "hook window.__onirtech absent");
  }
}

async function runDiscussion(page, res) {
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);
  const t0 = Date.now();
  await page.locator(`${HOST} .actions.show .act-disc`).click();
  await waitSelector(page, ".discussion.open", "discussion ouverte", 5000);
  const discussionOpen = Date.now() - t0;
  res.timings.discussionOpen = discussionOpen;
  check(res, "discussion ouverte", true, `${discussionOpen} ms`);
  const hasBoard = await shadowEval(page, (sr) => !!sr?.querySelector(".discussion .board"));
  const hasComposer = await shadowEval(page, (sr) => !!sr?.querySelector(".discussion .composer input"));
  check(res, "tableau présent", hasBoard);
  check(res, "composer présent", hasComposer);
  await checkMachineInvariants(page, res, "discussion");
  await shot(page, "discussion-01-open");

  await page.locator(`${HOST} .discussion .composer input`).fill("Bonjour baseline");
  await page.locator(`${HOST} .discussion .composer .csend`).click();
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !!sr?.querySelector(".dialogue .bubble.user");
  }, "bulle utilisateur");
  await waitShadow(page, () => {
    const host = document.querySelector("onirtech-template-immersive");
    return (host?.onirtechContext?.state?.messages?.length ?? 0) >= 3;
  }, "réponse assistant", 30000);
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !!sr?.querySelector(".dialogue .bubble.assistant");
  }, "bulle assistant affichée", 5000);
  const bubbles = await shadowEval(page, (sr) => sr?.querySelectorAll(".dialogue .bubble").length ?? 0);
  const discCount = await page.evaluate(() => document.querySelector("onirtech-template-immersive")?.onirtechContext?.state?.messages?.length ?? 0);
  check(res, "envoi message + réponse", bubbles >= 1 && discCount >= 3, `${bubbles} bulle affichée · ${discCount} messages`);
  await shot(page, "discussion-02-message");

  // La réponse est révélée progressivement : on attend la fin de la page courante
  // (un appui sur ‹ terminerait d'abord la frappe, sans changer de message).
  await waitShadow(page, () => {
    const b = document.querySelector("onirtech-template-immersive")?.shadowRoot?.querySelector(".dialogue .bubble.assistant");
    return !!b && b.dataset.typing !== "1";
  }, "frappe de la réponse terminée", 15000);
  const before = await shadowEval(page, (sr) => sr?.querySelector(".dfolio")?.textContent?.trim() || "");
  await page.locator(`${HOST} .dnav.prev`).click();
  await sleep(150);
  const after = await shadowEval(page, (sr) => sr?.querySelector(".dfolio")?.textContent?.trim() || "");
  check(res, "navigation message par message", before !== after, `${before} → ${after}`);

  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".discussion.open");
  }, "discussion fermée", 5000);
  check(res, "discussion fermée (Escape)", true);
}

// « Terminer » : bouton toujours visible, mais JAMAIS d'action directe — il ouvre une
// MODALE de confirmation séparée. Confirmer émet `finish` (génération de la fiche) et
// affiche un toast de confirmation. Annuler / Échap ferment la modale sans rien émettre.
async function runFinish(page, res) {
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);
  await page.locator(`${HOST} .actions.show .act-disc`).click();
  await waitSelector(page, ".discussion.open", "discussion ouverte", 5000);

  const finishes = () => page.evaluate(() => window.__finished ?? 0);
  const modalOpen = () => shadowEval(page, (sr) => sr?.querySelector(".finishmodal")?.classList.contains("open") === true);
  const toastShown = () => shadowEval(page, (sr) => sr?.querySelector(".finishtoast")?.classList.contains("show") === true);
  const toastText = () => shadowEval(page, (sr) => sr?.querySelector(".finishtoast")?.textContent?.trim() ?? "");
  const openModal = async () => {
    await page.locator(`${HOST} .discussion .composer .cfinish`).click();
    await waitShadow(page, () => {
      const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
      return sr?.querySelector(".finishmodal")?.classList.contains("open") === true;
    }, "modale ouverte", 3000);
  };

  check(res, "bouton Terminer présent", await shadowEval(page, (sr) => !!sr?.querySelector(".composer .cfinish")));
  check(res, "modale fermée au départ", (await modalOpen()) === false);

  // 1) Le bouton n'agit pas directement : il ouvre une modale séparée.
  await openModal();
  const title = await shadowEval(page, (sr) => sr?.querySelector(".finishcard .finishtitle")?.textContent?.trim() ?? "");
  const text = await shadowEval(page, (sr) => sr?.querySelector(".finishcard .finishtext")?.textContent?.trim() ?? "");
  const buttons = await shadowEval(page, (sr) => [...(sr?.querySelectorAll(".finishbtns button") ?? [])].map((b) => b.textContent.trim()));
  check(res, "modale : titre explicite", title === "Terminer la conversation ?", title);
  check(res, "modale : conséquences décrites", /fiche/i.test(text) && /générée/i.test(text), text);
  check(res, "modale : Annuler + Terminer", buttons[0] === "Annuler" && buttons[1] === "Terminer", buttons.join(" / "));
  check(res, "aucune fiche à l'ouverture", (await finishes()) === 0);
  await shot(page, "finish-01-modal");

  // 2) Annuler et Échap ferment la modale SANS terminer, et sans fermer le chat.
  await page.locator(`${HOST} .finishmodal .fghost`).click();
  await sleep(120);
  const stillChat = await shadowEval(page, (sr) => sr?.querySelector(".discussion")?.classList.contains("open") === true);
  check(res, "Annuler ferme la modale", (await modalOpen()) === false && (await finishes()) === 0 && stillChat);

  await openModal();
  await page.keyboard.press("Escape");
  await sleep(120);
  check(res, "Échap ferme la modale (chat ouvert)", (await modalOpen()) === false
    && (await finishes()) === 0 && (await shadowEval(page, (sr) => sr?.querySelector(".discussion")?.classList.contains("open") === true)));

  // 3) Confirmer : modale fermée, finish émis, toast de confirmation visible.
  await openModal();
  await page.locator(`${HOST} .finishmodal .fgo`).click();
  await sleep(250);
  const sent = await finishes();
  const status = await page.evaluate(() => document.querySelector("onirtech-template-immersive")?.onirtechContext?.state?.status);
  check(res, "confirmer émet finish", sent === 1, `${sent}`);
  check(res, "modale refermée après confirmation", (await modalOpen()) === false);
  check(res, "statut hôte = finalisee", status === "finalisee", String(status));
  check(res, "toast de confirmation affiché", await toastShown(), await toastText());
  check(res, "toast : fiche en génération", /fiche/i.test(await toastText()) && /génération/i.test(await toastText()), await toastText());
  await shot(page, "finish-02-toast");

  // 4) Le toast disparaît seul et le bouton reste utilisable (jamais masqué/désactivé).
  await sleep(4600);
  check(res, "toast auto-masqué", (await toastShown()) === false);
  const btn = await shadowEval(page, (sr) => {
    const b = sr?.querySelector(".composer .cfinish");
    if (!b) return null;
    const st = getComputedStyle(b);
    return { visible: !!b.offsetParent || st.display !== "none", disabled: !!b.disabled, opacity: st.opacity };
  });
  check(res, "bouton Terminer toujours actif", !!btn && btn.visible && !btn.disabled && btn.opacity !== "0", JSON.stringify(btn));

  await page.keyboard.press("Escape");
}

// Message LONG : la bulle garde une hauteur FIXE (aucun défilement), le texte est
// révélé progressivement puis PAGINÉ (marqueurs « … » en tête de page 2+ et en pied
// de page tronquée), les flèches ‹ › feuillettent les pages avant les messages.
async function runLongMessage(page, res) {
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);
  await page.locator(`${HOST} .actions.show .act-disc`).click();
  await waitSelector(page, ".discussion.open", "discussion ouverte", 8000);

  await page.locator(`${HOST} .discussion .composer input`).fill("/long");
  await page.locator(`${HOST} .discussion .composer .csend`).click();
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    const b = sr?.querySelector(".dialogue .bubble.assistant");
    return !!b && b.textContent.trim().length > 0;
  }, "bulle assistant (message long)", 30000);

  // 1) Frappe PROGRESSIVE : le texte est révélé peu à peu.
  const typing = await shadowEval(page, (sr) => {
    const b = sr?.querySelector(".dialogue .bubble.assistant");
    return b?.dataset.typing === "1" && b.classList.contains("typing");
  });
  check(res, "frappe progressive démarrée", typing);
  const len1 = await shadowEval(page, (sr) => sr?.querySelector(".dialogue .bubble.assistant")?.textContent?.length ?? 0);
  await sleep(400);
  const len2 = await shadowEval(page, (sr) => sr?.querySelector(".dialogue .bubble.assistant")?.textContent?.length ?? 0);
  check(res, "texte révélé caractère par caractère", len2 > len1, `${len1} → ${len2} caractères`);
  await shot(page, "longmsg-01-typing");

  // 2) HAUTEUR FIXE : ni le dialogue ni la bulle ne défilent, rien n'est coupé en silence.
  const box = await shadowEval(page, (sr) => {
    const d = sr?.querySelector(".dialogue");
    const b = sr?.querySelector(".dialogue .bubble.assistant");
    const cs = d ? getComputedStyle(d) : null;
    return {
      overflow: cs?.overflowY ?? "",
      dialogueOverflow: d ? d.scrollHeight - d.clientHeight : -1,
      bubbleOverflow: b ? b.scrollHeight - b.clientHeight : -1,
      height: b ? Math.round(b.getBoundingClientRect().height) : 0,
      width: b ? Math.round(b.getBoundingClientRect().width) : 0,
    };
  });
  check(res, "dialogue sans défilement", box.overflow === "hidden" && box.dialogueOverflow <= 1,
    `overflow-y=${box.overflow} débordement=${box.dialogueOverflow}px`);
  check(res, "bulle sans défilement (hauteur fixe)", box.bubbleOverflow <= 1,
    `débordement=${box.bubbleOverflow}px · ${box.width}×${box.height}px`);

  // 3) Clic sur la bulle = affichage immédiat de la page en cours.
  await page.locator(`${HOST} .dialogue .bubble.assistant`).click();
  await sleep(150);
  const p1 = await shadowEval(page, (sr) => {
    const b = sr?.querySelector(".dialogue .bubble.assistant");
    return { page: Number(b?.dataset.page ?? 0), pages: Number(b?.dataset.pages ?? 0),
      end: b?.querySelector(".cont-end")?.textContent?.trim() ?? "",
      typing: b?.dataset.typing === "1" };
  });
  check(res, "frappe terminée au clic", !p1.typing);
  check(res, "message long paginé", p1.pages >= 2, `${p1.page}/${p1.pages}`);
  check(res, "marqueur de troncature en pied de page", p1.end === "…", JSON.stringify(p1.end));
  await shot(page, "longmsg-02-page-1");

  // 4) Page suivante : le marqueur de continuation est en TÊTE.
  await page.locator(`${HOST} .dnav.next`).click();
  await sleep(150);
  const p2 = await shadowEval(page, (sr) => {
    const b = sr?.querySelector(".dialogue .bubble.assistant");
    return { page: Number(b?.dataset.page ?? 0),
      start: b?.querySelector(".cont-start")?.textContent?.trim() ?? "",
      folio: sr?.querySelector(".dfolio")?.textContent?.trim() ?? "" };
  });
  check(res, "page suivante affichée", p2.page === p1.page + 1, `${p2.page}/${p1.pages}`);
  check(res, "marqueur de continuation en tête de page", p2.start === "…", JSON.stringify(p2.start));
  check(res, "folio du message paginé", /·\s*\d+\/\d+/.test(p2.folio), p2.folio);
  await shot(page, "longmsg-03-page-2");

  // 5) Page précédente : retour instantané à la première page.
  await page.locator(`${HOST} .dnav.prev`).click();
  await sleep(150);
  const p3 = await shadowEval(page, (sr) => Number(sr?.querySelector(".dialogue .bubble.assistant")?.dataset.page ?? 0));
  check(res, "retour à la page précédente", p3 === 1, `page ${p3}`);

  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".discussion.open");
  }, "discussion fermée", 5000);
}

// Actions « Discuter » / « Ouvrir album » vues DE L'EXTÉRIEUR (colonne empilée en haut à droite) :
// on entre en salle, on ressort (porte) puis on vérifie les boutons, leur empilement et le
// comportement au clic (entrée dans la maison PUIS ouverture de la vue demandée).
async function runOutside(page, res) {
  // État SANS identité mémorisée : les scénarios partagent le contexte du navigateur.
  await goto(page, "phase=chat&consent=1&debug=1");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } });

  // SAS d'entrée : AUCUN bouton extérieur tant que le formulaire est affiché.
  await goto(page, "phase=identity&consent=1&debug=1");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !!(sr?.querySelector(".entry.show") && sr.querySelector('input[type="email"]'));
  }, "formulaire du sas (extérieur)");
  const duringEntry = await shadowEval(page, (sr) => !!sr?.querySelector(".outside-actions.show"));
  check(res, "aucun bouton extérieur pendant le sas", duringEntry === false);
  await shot(page, "outside-00-entry");

  // Identité du sas → salle, puis SORTIE (porte) : c'est dehors que la colonne apparaît.
  await page.locator(`${HOST} .entry input[type="text"]`).fill("Outside");
  await page.locator(`${HOST} .entry input[type="email"]`).fill("outside@example.com");
  await page.locator(`${HOST} .entry .check input[type="checkbox"]`).check();
  await page.locator(`${HOST} .entry .form button[type="submit"]`).click();
  await waitActions(page);
  await page.evaluate(() => window.__onirtech?.exitOutside?.());
  await waitSelector(page, ".outside-actions.show", "boutons extérieurs visibles");
  const roomBarHidden = await shadowEval(page, (sr) => !sr?.querySelector(".actions.show"));
  check(res, "barre de la salle masquée dehors", roomBarHidden, "");
  await shot(page, "outside-01-actions");

  const labels = await shadowEval(page, (sr) =>
    [...(sr?.querySelectorAll(".outside-actions .action .lbl") ?? [])].map((n) => n.textContent.trim()));
  check(res, "2 boutons extérieurs (Discuter, Ouvrir album)", labels.length === 2 && labels[0] === "Discuter" && labels[1] === "Ouvrir album", labels.join(" | "));

  // EMPILEMENT : même bord droit, « Ouvrir album » SOUS « Discuter ».
  const discBox = await page.locator(`${HOST} .outside-actions .act-disc`).boundingBox();
  const albumBox = await page.locator(`${HOST} .outside-actions .act-album`).boundingBox();
  const stacked = !!discBox && !!albumBox &&
    Math.abs((discBox.x + discBox.width) - (albumBox.x + albumBox.width)) <= 2 &&
    albumBox.y >= discBox.y + discBox.height - 2;
  check(res, "boutons empilés en haut à droite", stacked,
    discBox && albumBox ? `disc y=${Math.round(discBox.y)} album y=${Math.round(albumBox.y)}` : "boutons absents");

  // Clic « Discuter » DEPUIS L'EXTÉRIEUR : la maison d'abord (porte/travelling) puis la discussion.
  const t0 = Date.now();
  await page.locator(`${HOST} .outside-actions .act-disc`).click();
  await waitSelector(page, ".discussion.open", "discussion ouverte depuis l'extérieur");
  check(res, "discussion ouverte depuis l'extérieur", true, `${Date.now() - t0} ms`);
  const enteredRoom = await page.evaluate(() => {
    const host = document.querySelector("onirtech-template-immersive");
    return !!host?.shadowRoot?.querySelector(".discussion.open");
  });
  const outsideGone = await shadowEval(page, (sr) => !sr?.querySelector(".outside-actions.show"));
  check(res, "boutons extérieurs masqués après entrée", enteredRoom && outsideGone);
  await checkMachineInvariants(page, res, "extérieur → discussion");
  await shot(page, "outside-02-discussion");
  await page.keyboard.press("Escape");

  // Clic « Ouvrir album » : même parcours, l'album s'ouvre à l'arrivée de la caméra.
  await page.evaluate(() => window.__onirtech?.exitOutside?.());
  await waitSelector(page, ".outside-actions.show", "boutons extérieurs visibles (album)");
  await page.locator(`${HOST} .outside-actions .act-album`).click();
  await waitSelector(page, ".bookov.open", "album ouvert depuis l'extérieur", 60000);
  check(res, "album ouvert depuis l'extérieur", true);
  await checkMachineInvariants(page, res, "extérieur → album");
  await shot(page, "outside-03-album");
  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".bookov.open");
  }, "album refermé", 5000);
}

async function runMobile(page, res) {
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);

  const labelsHidden = await shadowEval(page, (sr) => {
    const lbl = sr?.querySelector(".actions.show .action .lbl");
    return !!lbl && getComputedStyle(lbl).display === "none";
  });
  check(res, "libellés masqués (mobile)", labelsHidden);
  const actionBox = await page.locator(`${HOST} .actions.show .act-disc`).boundingBox();
  check(res, "cible tactile ≥ 44 px", !!actionBox && actionBox.width >= 44 && actionBox.height >= 44,
    actionBox ? `${Math.round(actionBox.width)}×${Math.round(actionBox.height)}` : "absente");
  await shot(page, "mobile-01-room");

  await page.locator(`${HOST} .actions.show .act-album`).click();
  await waitSelector(page, ".bookov.open.single", "livre single mobile", 60000);
  await waitFolio(page, "pagination mobile");
  check(res, "livre mobile en une page", true);
  await shot(page, "mobile-02-book");
  await page.keyboard.press("Escape");
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return !sr?.querySelector(".bookov.open");
  }, "livre mobile refermé", 5000);
  await waitActions(page);

  await page.locator(`${HOST} .actions.show .act-disc`).click();
  await waitSelector(page, ".discussion.open", "discussion mobile", 5000);
  const narrow = await shadowEval(page, (sr) => sr?.querySelector(".discussion")?.classList.contains("narrowboard") === true);
  check(res, "tableau repliable ≤ 1024", narrow);
  const toggle = page.locator(`${HOST} .boardtoggle`);
  // `click()` Playwright est bloqué par l'actionnabilité (parent `pointer-events:none`
  // du panneau) : on déclenche le handler par un clic DOM, ce qui teste bien `#toggleBoard`.
  await toggle.evaluate((b) => b.click());
  const opened = await shadowEval(page, (sr) => sr?.querySelector(".discussion")?.classList.contains("narrowboard-open") === true);
  const expanded = await page.locator(`${HOST} .boardtoggle`).getAttribute("aria-expanded");
  check(res, "tableau déplié", opened && expanded === "true", `aria-expanded=${expanded}`);
  await toggle.evaluate((b) => b.click());
  const closed = await shadowEval(page, (sr) => sr?.querySelector(".discussion")?.classList.contains("narrowboard-open") === false);
  check(res, "tableau replié", closed);
  await shot(page, "mobile-03-discussion");

  // Zone basse = 30 % de l'écran : le personnage reste visible et le texte respire.
  const bottom = await shadowEval(page, (sr) => {
    const el = sr?.querySelector(".discbottom");
    return el ? el.getBoundingClientRect().height / window.innerHeight : 0;
  });
  check(res, "zone basse ≈ 30 % (mobile)", Math.abs(bottom - 0.3) < 0.02, `${(bottom * 100).toFixed(1)} %`);

  // Composer : « Envoyer » et « Terminer » en icônes, cibles ≥ 44 px.
  const composer = await shadowEval(page, (sr) => {
    const btns = [...(sr?.querySelectorAll(".composer button") ?? [])];
    return {
      count: btns.length,
      classes: btns.map((b) => b.className),
      labelsHidden: btns.map((b) => {
        const l = b.querySelector(".lbl");
        return !!l && getComputedStyle(l).display === "none";
      }),
      icons: btns.map((b) => !!b.querySelector(".ico svg")),
      boxes: btns.map((b) => {
        const r = b.getBoundingClientRect();
        return `${Math.round(r.width)}×${Math.round(r.height)}`;
      }),
    };
  });
  const bigEnough = composer.boxes.every((b) => b.split("×").every((n) => Number(n) >= 44));
  check(res, "composer mobile : 2 boutons icônes", composer.count === 2 && composer.icons.every(Boolean)
    && composer.labelsHidden.every(Boolean), `${composer.count} · ${composer.classes.join(",")}`);
  check(res, "composer mobile : cibles ≥ 44 px", bigEnough, composer.boxes.join(" "));
  check(res, "bouton Terminer présent (mobile)", composer.classes.some((c) => c.includes("cfinish")), composer.classes.join(","));
  await shot(page, "mobile-04-composer");

  // Modale de confirmation sur mobile : carte dans l'écran, boutons ≥ 44 px.
  await page.locator(`${HOST} .discussion .composer .cfinish`).click();
  await waitShadow(page, () => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    return sr?.querySelector(".finishmodal")?.classList.contains("open") === true;
  }, "modale mobile ouverte", 3000);
  const modalBox = await page.evaluate(() => {
    const sr = document.querySelector("onirtech-template-immersive")?.shadowRoot;
    const card = sr?.querySelector(".finishcard")?.getBoundingClientRect();
    const btns = [...(sr?.querySelectorAll(".finishbtns button") ?? [])].map((b) => b.getBoundingClientRect());
    return card ? {
      inside: card.left >= 0 && card.top >= 0 && card.right <= window.innerWidth + 1 && card.bottom <= window.innerHeight + 1,
      card: `${Math.round(card.width)}×${Math.round(card.height)}`,
      targets: btns.map((r) => `${Math.round(r.width)}×${Math.round(r.height)}`),
    } : null;
  });
  check(res, "modale mobile dans l'écran", !!modalBox?.inside, modalBox?.card);
  check(res, "modale mobile : cibles ≥ 44 px", !!modalBox && modalBox.targets.every((t) => t.split("×").every((n) => Number(n) >= 44)),
    modalBox?.targets.join(" "));
  await shot(page, "mobile-05-modal");
  await page.locator(`${HOST} .finishmodal .fghost`).click();

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check(res, "aucun débordement horizontal", overflow.doc <= overflow.win + 1, `${overflow.doc} ≤ ${overflow.win}`);

  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(200);
}

async function runRemount(page, res) {
  await goto(page, "phase=chat&consent=1&debug=1");
  await waitActions(page);
  const before = await shadowEval(page, (sr) => sr?.querySelectorAll("canvas").length ?? 0);
  await page.evaluate(() => {
    const host = document.querySelector("onirtech-template-immersive");
    const parent = host.parentElement;
    host.remove();
    const again = document.createElement("onirtech-template-immersive");
    again.id = "remounted";
    parent.appendChild(again);
  });
  await page.evaluate(() => window.__hostRender?.());
  await waitShadow(page, () => {
    const host = document.querySelector("#remounted");
    return !!(host?.shadowRoot?.querySelector("canvas"));
  }, "re-montage canvas", 60000);
  await waitActions(page, 60000);
  const after = await page.evaluate(() => document.querySelector("#remounted")?.shadowRoot?.querySelectorAll("canvas").length ?? 0);
  const hostCount = await page.evaluate(() => document.querySelectorAll("onirtech-template-immersive").length);
  check(res, "un seul élément", hostCount === 1, `${hostCount} éléments`);
  check(res, "un seul canvas après re-montage", after === 1, `${before} avant → ${after} après`);
  check(res, "actions visibles après re-montage", true);
  const debugNodes = await page.evaluate(() => document.querySelectorAll("#onirtech-debug").length);
  check(res, "aucun overlay debug orphelin", debugNodes <= 1, `${debugNodes} nœud(s) debug`);
  await checkMachineInvariants(page, res, "re-montage");

  // Onglet caché : la boucle RAF doit s'arrêter puis reprendre sans dt géant.
  const framesBefore = await page.evaluate(() => window.__onirtech?.__frameCount ?? 0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(900);
  const framesHidden = await page.evaluate(() => window.__onirtech?.__frameCount ?? 0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(900);
  const framesResumed = await page.evaluate(() => window.__onirtech?.__frameCount ?? 0);
  check(res, "pause RAF onglet caché", framesHidden - framesBefore <= 1, `${framesBefore} → ${framesHidden}`);
  check(res, "reprise RAF après onglet visible", framesResumed > framesHidden, `${framesHidden} → ${framesResumed}`);

  await shot(page, "remount-01");
}

// ---------------------------------------------------------------------------
// Baseline / budgets
// ---------------------------------------------------------------------------
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readManifest() {
  return JSON.parse(readFileSync(join(TEMPLATE_DIR, "onirtech.template.json"), "utf8"));
}

function buildBaseline() {
  const manifest = readManifest();
  const entryPath = join(TEMPLATE_DIR, manifest.ui.entry.replace(/^\.\//, ""));
  const entryBuf = readFileSync(entryPath);
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const book = byName.book || {};
  const entry = byName.entry || {};
  const archive = arg("archive", null);
  const baseline = {
    template: manifest.id,
    version: manifest.version,
    generatedAt: new Date().toISOString(),
    entry: { sha256: sha256(entryBuf), bytes: entryBuf.length },
    archive: archive && existsSync(archive) ? { bytes: statSync(archive).size } : null,
    render: {
      software: book.metrics?.software ?? null,
      gpu: book.metrics?.gpu ?? null,
      calls: book.metrics?.calls ?? null,
      triangles: book.metrics?.triangles ?? null,
      textures: book.metrics?.textures ?? null,
      geometries: book.metrics?.geometries ?? null,
      p95: book.metrics?.p95 ?? null,
    },
    timings: { ...entry.timings, ...(book.timings || {}), ...(byName.discussion?.timings || {}) },
    pages: { desktop: book.pages?.desktop ?? null, single: book.pages?.single ?? null },
    budgets: {
      drawCalls: 150,
      triangles: 400000,
      p95: 250,
      textureDelta: 2,
      geometryDelta: 2,
      timingRatio: 0.1,
      // Rendu logiciel (SwiftShader/CI) : bruit important, tolérance large.
      timingFloorMs: book.metrics?.software ? 10000 : 150,
      archiveRatio: 1.05,
    },
    scenarios: Object.fromEntries(results.map((r) => [r.name, { status: r.status, checks: r.checks.length }])),
  };
  return baseline;
}

function compareBaseline(baseline) {
  const res = scenarioResult("baseline");
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const book = byName.book;
  const entry = byName.entry;

  const b = baseline.budgets || {};
  const render = book?.metrics;
  if (render) {
    check(res, "budget draw calls", render.calls <= (b.drawCalls ?? 150), `${render.calls} ≤ ${b.drawCalls ?? 150}`);
    check(res, "budget triangles", render.triangles <= (b.triangles ?? 400000), `${render.triangles} ≤ ${b.triangles ?? 400000}`);
    if (baseline.render?.textures != null) {
      check(res, "budget textures", render.textures <= baseline.render.textures + (b.textureDelta ?? 2),
        `${render.textures} ≤ ${baseline.render.textures}+${b.textureDelta ?? 2}`);
    }
    if (baseline.render?.geometries != null) {
      check(res, "budget geometries", render.geometries <= baseline.render.geometries + (b.geometryDelta ?? 2),
        `${render.geometries} ≤ ${baseline.render.geometries}+${b.geometryDelta ?? 2}`);
    }
    if (render.p95 != null) {
      check(res, "budget p95", render.p95 <= (b.p95 ?? 250), `${render.p95.toFixed(1)} ms ≤ ${b.p95 ?? 250} ms`);
    } else {
      skip(res, "budget p95", "rendu logiciel — non significatif");
    }
  } else {
    skip(res, "budgets GPU", "aucune mesure");
  }

  const ratio = b.timingRatio ?? 0.1;
  const floor = b.timingFloorMs ?? 150;
  for (const [key, expected] of Object.entries(baseline.timings || {})) {
    if (expected == null) continue;
    const actual = entry?.timings?.[key] ?? book?.timings?.[key] ?? byName.discussion?.timings?.[key];
    if (actual == null) continue;
    if (render?.software === true) {
      // Rendu logiciel (CI/SwiftShader) : les timings varient trop pour être un gate.
      skip(res, `timing ${key}`, `${actual} ms — rendu logiciel, non significatif`);
      continue;
    }
    const tol = Math.max(floor, expected * ratio);
    check(res, `timing ${key}`, Math.abs(actual - expected) <= tol, `${actual} ms (baseline ${expected} ± ${Math.round(tol)})`);
  }

  if (baseline.pages?.desktop != null) {
    check(res, "pages desktop = baseline", book?.pages?.desktop === baseline.pages.desktop,
      `${book?.pages?.desktop} = ${baseline.pages.desktop}`);
  }
  if (baseline.pages?.single != null) {
    check(res, "pages single = baseline", book?.pages?.single === baseline.pages.single,
      `${book?.pages?.single} = ${baseline.pages.single}`);
  }

  const archive = arg("archive", null);
  if (archive && existsSync(archive) && baseline.archive?.bytes) {
    const size = statSync(archive).size;
    const max = Math.floor(baseline.archive.bytes * (b.archiveRatio ?? 1.05));
    check(res, "budget archive", size <= max, `${size} ≤ ${max} (baseline ${baseline.archive.bytes})`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
const ALL = ["entry", "book", "discussion", "outside", "mobile", "remount"];
const requested = SCENARIO === "all" ? [...ALL] : [SCENARIO];
for (const name of requested) {
  if (!["entry", "book", "discussion", "outside", "mobile", "remount", "longmsg", "finish"].includes(name)) {
    console.error(`Scénario inconnu : ${name} (entry|book|discussion|outside|mobile|remount|longmsg|finish|all)`);
    process.exit(2);
  }
}

const chrome = findChrome();
if (!chrome) {
  console.log("SKIP  aucun Chromium trouvé (CHROME_PATH ou cache Playwright) — flow non exécuté");
  process.exit(0);
}
const playwright = loadPlaywright();
if (!playwright) {
  console.log("SKIP  playwright-core absent — flow non exécuté");
  process.exit(0);
}

let harness;
let browser;
try {
  harness = await startHarness({ dir: TEMPLATE_DIR, port: PORT });
  browser = await launchChromium(playwright, chrome);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`http ${r.status()}: ${r.url()}`); });

  const runners = {
    entry: runEntry,
    book: runBook,
    discussion: runDiscussion,
    outside: runOutside,
    mobile: runMobile,
    remount: runRemount,
    longmsg: runLongMessage,
    finish: runFinish,
  };

  for (const name of requested) {
    log(`\n▶ scénario ${name}`);
    const res = scenarioResult(name);
    try {
      if (["book", "discussion", "outside", "mobile", "longmsg", "finish"].includes(name)) {
        await page.setViewportSize({ width: 1280, height: 800 });
      }
      await runners[name](page, res);
    } catch (e) {
      check(res, "exécution", false, e.message.split("\n")[0]);
    }
    if (errors.length) check(res, "0 erreur console/page", false, errors.slice(0, 3).join(" | "));
    else check(res, "0 erreur console/page", true);
    for (const c of res.checks) log(`  ${c.status.padEnd(4)} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    log(`  → ${res.status}`);
  }

  if (BASELINE) {
    const file = isAbsolute(BASELINE) ? BASELINE : resolve(process.cwd(), BASELINE);
    const baseline = JSON.parse(readFileSync(file, "utf8"));
    log(`\n▶ comparaison baseline (${file})`);
    const cmp = compareBaseline(baseline);
    for (const c of cmp.checks) log(`  ${c.status.padEnd(4)} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    log(`  → ${cmp.status}`);
  }

  const summary = buildBaseline();
  if (WRITE_BASELINE) {
    const file = isAbsolute(WRITE_BASELINE) ? WRITE_BASELINE : resolve(process.cwd(), WRITE_BASELINE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
    log(`\nbaseline écrite : ${file}`);
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  if (JSON_MODE) {
    console.log(JSON.stringify({ results, baseline: summary, failed }, null, 2));
  } else {
    log(`\n${failed === 0 ? "✔ FLOW CONFORME" : `✘ ${failed} SCÉNARIO(S)/CONTRÔLE(S) EN ÉCHEC`}`);
  }
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error(`✘ flow : ${e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (harness) harness.kill("SIGTERM");
}
