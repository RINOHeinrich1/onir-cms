#!/usr/bin/env node

import { join } from "node:path";
import { findChrome, kitRoot, launchChromium, loadPlaywright, startHarness as startBrowserHarness } from "./lib/browser.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};

const PORT = Number(arg("port", 4699));
const MIN_LUM = Number(arg("min-lum", 8));
const MAX_CALLS = Number(arg("max-calls", 150));
const MAX_TRIS = Number(arg("max-tris", 400000));
const MAX_P95 = Number(arg("max-p95", 250));

const chrome = findChrome();
if (!chrome) {
  console.log("SKIP  aucun Chromium trouvé (CHROME_PATH ou cache Playwright) — test de rendu non exécuté");
  process.exit(0);
}

const playwright = loadPlaywright();
if (!playwright) {
  console.log("SKIP  playwright-core absent — test de rendu non exécuté");
  process.exit(0);
}

const startHarness = () => startBrowserHarness({ dir: join(kitRoot, "template-immersive"), port: PORT });

const results = [];
const push = (status, label, detail = "") => results.push({ status, label, detail });

const harness = await startHarness();
let browser;
try {
  browser = await launchChromium(playwright, chrome);

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?phase=chat&consent=1&diag=1`, {
    waitUntil: "load",
    timeout: 60000,
  });
  await page.waitForTimeout(14000);

  const m = await page.evaluate(async () => {
    const o = window.__onirtech;
    if (!o) return { err: "hook diag absent (window.__onirtech)" };
    const { THREE, scene, camera, renderer, avatar } = o;

    const { box: _b, ..._rest } = {};

    const lum = (() => {
      // lecture immédiate après un rendu explicite (preserveDrawingBuffer = false)
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext("2d");
      ctx.drawImage(src, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      let bright = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += l;
        if (l > 30) bright++;
      }
      const n = data.length / 4;
      return { mean: sum / n, brightRatio: bright / n };
    })();

    const box = new THREE.Box3().setFromObject(avatar);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // on cadre l'avatar pour tester SON rendu (le harnais regarde l'album)
    const dist = Math.max(2.2, size.y * 1.6);
    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const ndc = center.clone().project(camera);
    const onScreen = Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z < 1;

    let eye = null;
    let head = null;
    avatar.traverse((n) => {
      if (!n.isBone) return;
      if (n.name === "LeftEye") eye = n.getWorldPosition(new THREE.Vector3());
      if (n.name === "Head") head = n.getWorldPosition(new THREE.Vector3());
    });
    const bboxWorld = {
      min: box.min.toArray().map((v) => +v.toFixed(3)),
      max: box.max.toArray().map((v) => +v.toFixed(3)),
    };

    const frames = await new Promise((res) => {
      const ts = [];
      let last = performance.now();
      function tick(now) {
        ts.push(now - last);
        last = now;
        if (ts.length < 120) requestAnimationFrame(tick);
        else res(ts);
      }
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    const p95 = frames[Math.floor(frames.length * 0.95)];

    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
    const software = /swiftshader|llvmpipe|software/i.test(String(gpu));

    return {
      software,
      gpu: String(gpu).slice(0, 60),
      env: !!scene.environment,
      lum,
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      p95,
      bboxWorld,
      onScreen,
      eyeAxis: eye && head ? { dx: +Math.abs(eye.x - head.x).toFixed(3), dz: +Math.abs(eye.z - head.z).toFixed(3) } : null,
      errors: [],
    };
  });

  if (m.err) {
    push("FAIL", "hook de diagnostic", m.err);
  } else {
    push(m.env ? "PASS" : "FAIL", "environnement (IBL)", m.env ? "scene.environment présent" : "absent → rendu noir");
    if (m.lum.mean >= MIN_LUM && m.lum.brightRatio > 0.005)
      push("PASS", "scène non noire", `luminance ${m.lum.mean.toFixed(1)} · ${(m.lum.brightRatio * 100).toFixed(1)} % de pixels éclairés`);
    else push("FAIL", "scène non noire", `luminance ${m.lum.mean.toFixed(1)} · ${(m.lum.brightRatio * 100).toFixed(1)} %`);

    const h = m.bboxWorld.max[1] - m.bboxWorld.min[1];
    if (m.onScreen && h > 0.3) push("PASS", "avatar visible", `${h.toFixed(2)} m dans le cadre`);
    else push("FAIL", "avatar visible", `onScreen=${m.onScreen} hauteur=${h.toFixed(2)}`);

    if (m.eyeAxis) {
      const { dx, dz } = m.eyeAxis;
      if (dx >= 2 * dz) push("PASS", "orientation avatar", `face caméra (dx=${dx}, dz=${dz})`);
      else push("FAIL", "orientation avatar", `profil probable (dx=${dx}, dz=${dz})`);
    } else {
      push("WARN", "orientation avatar", "os LeftEye/Head introuvables");
    }

    if (m.calls <= MAX_CALLS) push("PASS", "draw calls", `${m.calls} (max ${MAX_CALLS})`);
    else push("FAIL", "draw calls", `${m.calls} > ${MAX_CALLS}`);

    if (m.tris <= MAX_TRIS) push("PASS", "triangles rendus", `${m.tris} (max ${MAX_TRIS})`);
    else push("FAIL", "triangles rendus", `${m.tris} > ${MAX_TRIS}`);

    if (m.software) push("INFO", "frame time p95", `${m.p95.toFixed(1)} ms — rendu logiciel (non significatif)`);
    else if (m.p95 <= MAX_P95) push("PASS", "frame time p95", `${m.p95.toFixed(1)} ms (max ${MAX_P95})`);
    else push("FAIL", "frame time p95", `${m.p95.toFixed(1)} ms > ${MAX_P95}`);
  }

  if (errors.length) push("WARN", "erreurs JS", errors.slice(0, 3).join(" | "));
} catch (e) {
  push("FAIL", "exécution", e.message);
} finally {
  if (browser) await browser.close();
  harness.kill("SIGTERM");
}

for (const r of results) {
  console.log(`${r.status.padEnd(4)}  ${r.label}${r.detail ? " — " + r.detail : ""}`);
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${failed === 0 ? "✔ RENDU CONFORME" : `✘ ${failed} CONTRÔLE(S) DE RENDU ÉCHOUÉ(S)`}`);
process.exit(failed === 0 ? 0 : 1);
