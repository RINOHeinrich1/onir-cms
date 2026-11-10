// Rendu enrichi optionnel : KaTeX pour les maths, Mermaid pour les diagrammes.
// Les bibliothèques sont chargées à la demande, une seule fois, depuis un CDN
// versionné. En cas d'échec réseau, le contenu Markdown reste lisible.

const KATEX_VERSION = "0.16.22";
const MERMAID_VERSION = "11.4.1";
const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
const KATEX_AUTO = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/contrib/auto-render.min.js`;
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const MERMAID_JS = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

let katexPromise = null;
let mermaidPromise = null;
let diagramId = 0;

function appendStylesheet(root, href) {
  const scope = root.getRootNode?.() ?? document;
  const container = scope instanceof ShadowRoot ? scope : document.head;
  if (container.querySelector?.(`link[href="${href}"]`) !== null) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  container.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing !== null) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(src)), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(src)), { once: true });
    document.head.appendChild(script);
  });
}

function ensureKatex(root) {
  if (window.katex !== undefined && window.renderMathInElement !== undefined) {
    return Promise.resolve(true);
  }
  if (katexPromise !== null) return katexPromise;
  appendStylesheet(root, KATEX_CSS);
  katexPromise = loadScript(KATEX_JS)
    .then(() => loadScript(KATEX_AUTO))
    .then(() => true)
    .catch(() => false);
  return katexPromise;
}

function ensureMermaid() {
  if (window.mermaid !== undefined) return Promise.resolve(true);
  if (mermaidPromise !== null) return mermaidPromise;
  mermaidPromise = loadScript(MERMAID_JS)
    .then(() => {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      return true;
    })
    .catch(() => false);
  return mermaidPromise;
}

async function renderMath(root) {
  if (!(root.textContent ?? "").includes("$")) return;
  const ready = await ensureKatex(root);
  if (!ready || typeof window.renderMathInElement !== "function") return;
  try {
    window.renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  } catch {
    // Le texte Markdown reste affiché si KaTeX ne peut pas rendre une formule.
  }
}

async function renderDiagrams(root) {
  const blocks = [...root.querySelectorAll(".mermaid-block")];
  if (blocks.length === 0) return;
  const ready = await ensureMermaid();
  if (!ready) return;
  for (const block of blocks) {
    const source = block.textContent ?? "";
    if (source.trim() === "") continue;
    try {
      diagramId += 1;
      const result = await window.mermaid.render(`onir-mermaid-${diagramId}`, source);
      block.innerHTML = result.svg;
      block.classList.add("mermaid-rendered");
    } catch {
      block.classList.add("mermaid-error");
    }
  }
}

/** Enrichit un bloc Markdown déjà rendu dans le DOM. */
export async function enhanceRichContent(root) {
  await Promise.all([renderMath(root), renderDiagrams(root)]);
}
