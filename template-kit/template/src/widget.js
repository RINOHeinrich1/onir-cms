// Widget de référence (starter) — surface `widget` (ADR-0040).
// Le launcher et le panneau restent sous la responsabilité du template. Le
// cœur ne fournit que l'iframe, les actions et les bornes de taille.
const ELEMENT = "onirtech-widget-starter";
const OPEN_SIZE = { width: 420, height: 680 };
const PRIMARY_FALLBACK = "#023777";
const ACCENT_FALLBACK = "#fcad28";

const STYLE = `
  :host {
    display: block;
    width: 100%;
    height: 100%;
    --onir-primary: #023777;
    --onir-primary-ink: #ffffff;
    --onir-accent: #fcad28;
    --onir-accent-ink: #3b2500;
    --onir-ink: #0f172a;
    --onir-muted: #64748b;
    --onir-border: #e2e8f0;
    --onir-soft: #eef4fb;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--onir-ink);
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, textarea { font: inherit; }
  button { -webkit-tap-highlight-color: transparent; }
  [hidden] { display: none !important; }

  .launcher {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: #fff;
    background: var(--onir-primary);
    background: linear-gradient(145deg, var(--onir-primary), color-mix(in srgb, var(--onir-primary) 78%, #000));
    box-shadow: 0 12px 30px rgba(2, 55, 119, .32), 0 2px 8px rgba(15, 23, 42, .18);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .launcher:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(2, 55, 119, .38), 0 3px 10px rgba(15, 23, 42, .2); }
  .launcher:active { transform: translateY(0) scale(.97); }
  .launcher:focus-visible { outline: 3px solid var(--onir-accent); outline-offset: 3px; }
  .launcher svg { width: 54%; height: 54%; }
  .launcher .online {
    position: absolute;
    right: 7%;
    bottom: 7%;
    width: 14%;
    height: 14%;
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    background: #22c55e;
    border: 2px solid #fff;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, .2);
  }
  .launcher .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    border: 2px solid #fff;
    font-size: 11px;
    font-weight: 800;
    line-height: 16px;
    text-align: center;
  }

  .panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #fff;
    border: 1px solid rgba(15, 23, 42, .08);
    border-radius: 22px;
    box-shadow: 0 24px 70px rgba(15, 23, 42, .28), 0 4px 16px rgba(15, 23, 42, .12);
    animation: panel-in .24s cubic-bezier(.2, .8, .2, 1) both;
  }
  @keyframes panel-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }

  .head {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 12px 13px 15px;
    color: var(--onir-primary-ink);
    background: var(--onir-primary);
    background: linear-gradient(135deg, var(--onir-primary), color-mix(in srgb, var(--onir-primary) 82%, #000));
  }
  .head::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 100% at 0% 0%, rgba(255,255,255,.16), transparent 52%);
  }
  .brand-avatar {
    position: relative;
    z-index: 1;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 13px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, .16);
    border: 1px solid rgba(255, 255, 255, .22);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: .02em;
  }
  .brand-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .head-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
  .head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 750;
    line-height: 1.25;
    letter-spacing: -.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 3px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, .78);
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 0 0 rgba(74, 222, 128, .5);
    animation: status-pulse 2.4s ease-in-out infinite;
  }
  .status-dot.is-done { background: #fbbf24; animation: none; }
  @keyframes status-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, .45); }
    50% { box-shadow: 0 0 0 5px rgba(74, 222, 128, 0); }
  }
  .head-actions { position: relative; z-index: 1; display: flex; align-items: center; gap: 3px; }
  .finish {
    height: 30px;
    padding: 0 10px;
    border: 1px solid rgba(255, 255, 255, .28);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-size: 10px;
    font-weight: 750;
    letter-spacing: .08em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition: background .15s ease, border-color .15s ease;
  }
  .finish:hover:not(:disabled) { background: rgba(255, 255, 255, .12); border-color: rgba(255, 255, 255, .5); }
  .finish:disabled { opacity: .45; cursor: not-allowed; }
  .icon-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: .9;
    transition: background .15s ease, opacity .15s ease;
  }
  .icon-btn:hover { background: rgba(255, 255, 255, .13); opacity: 1; }
  .icon-btn:focus-visible, .finish:focus-visible, .send:focus-visible, .media:focus-visible, .done-close:focus-visible {
    outline: 3px solid var(--onir-accent);
    outline-offset: 2px;
  }

  .log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px 13px 8px;
    background: #f7f9fc;
    scrollbar-gutter: stable;
    scroll-behavior: smooth;
  }
  .log::-webkit-scrollbar { width: 8px; }
  .log::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 2px solid #f7f9fc; }
  .intro {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    margin: 0 0 14px;
    padding: 11px 12px;
    border: 1px solid #dbe7f5;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, .04);
    color: #334155;
    font-size: 12px;
    line-height: 1.5;
  }
  .intro svg { flex: none; margin-top: 1px; color: var(--onir-primary); }
  .intro strong { display: block; margin-bottom: 2px; color: var(--onir-ink); font-size: 12px; }
  .log-list { list-style: none; display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; }
  .msg { display: flex; align-items: flex-end; gap: 7px; max-width: 100%; animation: msg-in .22s ease both; }
  .msg.user { flex-direction: row-reverse; }
  @keyframes msg-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  .avatar {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--onir-primary);
    color: var(--onir-primary-ink);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .02em;
    user-select: none;
  }
  .msg.user .avatar { background: var(--onir-accent); color: var(--onir-accent-ink); }
  .msg-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; max-width: 84%; }
  .msg.user .msg-body { align-items: flex-end; }
  .bubble {
    max-width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--onir-border);
    border-radius: 14px;
    border-bottom-left-radius: 5px;
    background: #fff;
    color: var(--onir-ink);
    font-size: 12.5px;
    line-height: 1.52;
    overflow-wrap: anywhere;
    box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
  }
  .msg.user .bubble {
    border-color: transparent;
    border-radius: 14px;
    border-bottom-right-radius: 5px;
    background: var(--onir-primary);
    color: var(--onir-primary-ink);
    white-space: pre-wrap;
  }
  .msg-time { padding: 0 3px; color: var(--onir-muted); font-size: 9px; font-weight: 600; }
  .md > :first-child { margin-top: 0; }
  .md > :last-child { margin-bottom: 0; }
  .md p { margin: 0 0 7px; }
  .md p:last-child { margin-bottom: 0; }
  .md ul, .md ol { margin: 6px 0; padding-left: 17px; }
  .md li { margin: 3px 0; }
  .md li::marker { color: var(--onir-accent); }
  .md strong { font-weight: 750; }
  .md em { font-style: italic; }
  .md a { color: var(--onir-primary); text-decoration: underline; text-underline-offset: 2px; }
  .msg.user .md a { color: inherit; }
  .md code {
    padding: 1px 4px;
    border: 1px solid var(--onir-border);
    border-radius: 5px;
    background: #f1f5f9;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .88em;
  }
  .md pre { margin: 7px 0; padding: 9px 10px; overflow-x: auto; border: 1px solid var(--onir-border); border-radius: 8px; background: #f1f5f9; }
  .md pre code { padding: 0; border: 0; background: none; }
  .md blockquote { margin: 7px 0; padding-left: 9px; border-left: 3px solid var(--onir-accent); color: #475569; }
  .md-h { margin: 8px 0 5px; font-size: 13px; font-weight: 800; line-height: 1.3; }
  .md-h1 { font-size: 15px; }
  .md-h2 { font-size: 14px; }
  .md hr { margin: 9px 0; border: 0; border-top: 1px solid var(--onir-border); }
  .media-list { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 7px 0 0; padding: 0; }
  .media { padding: 0; border: 0; border-radius: 8px; overflow: hidden; background: none; cursor: zoom-in; line-height: 0; }
  .media img { display: block; width: 100%; max-width: 210px; max-height: 170px; object-fit: cover; border-radius: 8px; border: 1px solid var(--onir-border); }
  .media-link { display: inline-flex; padding: 5px 8px; border: 1px solid var(--onir-border); border-radius: 7px; color: var(--onir-primary); font-size: 11px; font-weight: 650; text-decoration: none; background: #fff; }
  .media-link:hover { border-color: var(--onir-primary); }
  .typing-row { display: flex; align-items: flex-end; gap: 7px; margin-top: 12px; animation: msg-in .2s ease both; }
  .typing-bubble { display: inline-flex; align-items: center; gap: 3px; padding: 10px 12px; border: 1px solid var(--onir-border); border-radius: 14px; border-bottom-left-radius: 5px; background: #fff; }
  .typing-bubble span { width: 5px; height: 5px; border-radius: 50%; background: #94a3b8; animation: typing-bounce 1.1s ease-in-out infinite; }
  .typing-bubble span:nth-child(2) { animation-delay: .15s; }
  .typing-bubble span:nth-child(3) { animation-delay: .3s; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-3px); opacity: 1; } }
  .empty { margin: 18px 0 0; padding: 14px 12px; border: 1px dashed #cbd8e8; border-radius: 12px; color: #64748b; font-size: 12px; text-align: center; line-height: 1.5; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

  .footer { flex: none; background: #fff; border-top: 1px solid var(--onir-border); }
  .composer { padding: 10px 11px 8px; }
  .composer-box {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    padding: 5px 5px 5px 11px;
    border: 1.5px solid #d5dfeb;
    border-radius: 14px;
    background: #fff;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  .composer-box:focus-within { border-color: var(--onir-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--onir-primary) 14%, transparent); }
  .composer textarea {
    flex: 1;
    min-width: 0;
    min-height: 28px;
    max-height: 104px;
    padding: 4px 0;
    border: 0;
    outline: 0;
    resize: none;
    overflow-y: auto;
    background: transparent;
    color: var(--onir-ink);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .composer textarea::placeholder { color: #94a3b8; }
  .send {
    flex: none;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 11px;
    display: grid;
    place-items: center;
    background: var(--onir-primary);
    color: var(--onir-primary-ink);
    cursor: pointer;
    transition: opacity .15s ease, transform .15s ease;
  }
  .send:hover:not(:disabled) { transform: translateY(-1px); }
  .send:disabled { opacity: .42; cursor: not-allowed; }
  .hint { margin: 6px 2px 0; color: #94a3b8; font-size: 9.5px; text-align: center; }
  .done { display: flex; align-items: center; gap: 10px; padding: 13px 14px; background: #f0fdf4; border-top: 1px solid #bbf7d0; }
  .done-icon { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #16a34a; color: #fff; }
  .done-copy { flex: 1; min-width: 0; }
  .done-copy strong { display: block; color: #166534; font-size: 12px; }
  .done-copy span { display: block; margin-top: 1px; color: #3f6212; font-size: 10.5px; line-height: 1.35; }
  .done-close { flex: none; height: 28px; padding: 0 10px; border: 1px solid #86efac; border-radius: 999px; background: #fff; color: #166534; font-size: 10px; font-weight: 750; cursor: pointer; }
  .done-close:hover { background: #dcfce7; }

  @media (max-width: 380px) {
    .panel { border-radius: 17px; }
    .head { padding: 11px 9px 11px 12px; }
    .brand-avatar { width: 36px; height: 36px; border-radius: 11px; }
    .finish { height: 28px; padding: 0 8px; font-size: 9px; }
    .log { padding: 11px 9px 7px; }
    .msg-body { max-width: 88%; }
    .bubble { font-size: 12px; }
    .composer { padding: 8px 8px 6px; }
    .hint { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
`;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
  return node;
}

const ICONS = {
  chat: [
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  ],
  close: ["M6 6l12 12", "M18 6L6 18"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  check: ["M20 6L9 17l-5-5"],
  spark: ["M12 3v3", "M12 18v3", "M4.2 7.5l2.6 1.5", "M17.2 15l2.6 1.5", "M4.2 16.5l2.6-1.5", "M17.2 9l2.6-1.5"],
};

function icon(name, size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function safeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return fallback;
}

function readableInk(hex) {
  const value = hex.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#162033" : "#ffffff";
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function appendInline(parent, text) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    if (match[1] !== undefined && match[2] !== undefined) {
      parent.appendChild(
        el("a", { href: match[2], target: "_blank", rel: "noopener noreferrer", text: match[1] }),
      );
    } else if (match[3] !== undefined) {
      parent.appendChild(el("strong", { text: match[3] }));
    } else if (match[4] !== undefined) {
      parent.appendChild(el("code", { text: match[4] }));
    } else if (match[5] !== undefined) {
      parent.appendChild(el("em", { text: match[5] }));
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function renderMarkdown(target, content) {
  const root = el("div", { class: "md" });
  const lines = String(content ?? "").replace(/\r\n?/g, "\n").split("\n");
  let paragraph = [];
  let list = null;
  let listTag = null;
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const block = el("p");
    paragraph.forEach((line, index) => {
      if (index > 0) block.appendChild(el("br"));
      appendInline(block, line);
    });
    root.appendChild(block);
    paragraph = [];
  };
  const flushList = () => {
    if (list !== null) root.appendChild(list);
    list = null;
    listTag = null;
  };
  const openList = (tag) => {
    if (list !== null && listTag === tag) return;
    flushList();
    list = el(tag);
    listTag = tag;
  };

  for (const source of lines) {
    const line = source.replace(/\s+$/, "");
    if (code !== null) {
      if (/^```/.test(line)) {
        root.appendChild(el("pre", {}, [el("code", { text: code.join("\n") })]));
        code = null;
      } else {
        code.push(source);
      }
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const block = el("div", { class: `md-h md-h${heading[1].length}` });
      appendInline(block, heading[2]);
      root.appendChild(block);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      root.appendChild(el("hr"));
      continue;
    }
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
    if (unordered !== null) {
      flushParagraph();
      openList("ul");
      const item = el("li");
      appendInline(item, unordered[1]);
      list.appendChild(item);
      continue;
    }
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ordered !== null) {
      flushParagraph();
      openList("ol");
      const item = el("li");
      appendInline(item, ordered[1]);
      list.appendChild(item);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote !== null) {
      flushParagraph();
      flushList();
      const block = el("blockquote");
      appendInline(block, quote[1]);
      root.appendChild(block);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (code !== null) root.appendChild(el("pre", {}, [el("code", { text: code.join("\n") })]));
  flushParagraph();
  flushList();
  target.appendChild(root);
}

function messageSignature(message) {
  const media = (message.medias ?? []).map((entry) => `${entry.type}:${entry.url}`).join("|");
  return `${message.id}|${message.role}|${message.content}|${media}|${message.at}`;
}

class StarterWidget extends HTMLElement {
  #root;
  #ctx;
  #style;
  #open = false;
  #finishing = false;
  #finishTimer;
  #unread = 0;
  #lastSeenId = null;
  #stick = true;
  #programmaticUntil = 0;
  #firstRender = true;
  #launcher = null;
  #launcherBadge = null;
  #panel = null;
  #brandAvatar = null;
  #brandName = null;
  #brandSignature = null;
  #statusText = null;
  #statusDot = null;
  #finishButton = null;
  #log = null;
  #list = null;
  #typing = null;
  #empty = null;
  #messageNodes = new Map();
  #composer = null;
  #input = null;
  #send = null;
  #hint = null;
  #done = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#style = el("style", { text: STYLE });
  }

  set onirtechContext(ctx) {
    this.#ctx = ctx;
    this.#applyTheme();
    if (!this.#open) {
      this.#showLauncher();
      this.#trackUnread();
      return;
    }
    if (this.#panel === null) this.#buildPanel();
    this.#updatePanel();
  }

  get onirtechContext() {
    return this.#ctx;
  }

  connectedCallback() {
    this.#applyTheme();
    this.#showLauncher();
  }

  disconnectedCallback() {
    window.clearTimeout(this.#finishTimer);
  }

  #applyTheme() {
    const primary = safeColor(this.#ctx?.theme?.primary, PRIMARY_FALLBACK);
    const accent = safeColor(this.#ctx?.theme?.accent ?? this.#ctx?.theme?.secondary, ACCENT_FALLBACK);
    this.style.setProperty("--onir-primary", primary);
    this.style.setProperty("--onir-primary-ink", readableInk(primary));
    this.style.setProperty("--onir-accent", accent);
    this.style.setProperty("--onir-accent-ink", readableInk(accent));
  }

  #showLauncher() {
    if (this.#launcher !== null) {
      this.#root.replaceChildren(this.#style, this.#launcher);
      this.#updateLauncherBadge();
      return;
    }
    const badge = el("span", { class: "badge", hidden: "true" });
    const button = el("button", {
      class: "launcher",
      type: "button",
      "aria-label": "Ouvrir la discussion",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
    }, [icon("chat", 30), el("span", { class: "online", "aria-hidden": "true" }), badge]);
    button.addEventListener("click", () => this.#openPanel());
    this.#launcher = button;
    this.#launcherBadge = badge;
    this.#root.replaceChildren(this.#style, button);
  }

  #updateLauncherBadge() {
    if (this.#launcherBadge === null) return;
    this.#launcherBadge.hidden = this.#unread === 0;
    this.#launcherBadge.textContent = this.#unread > 9 ? "9+" : String(this.#unread);
    this.#launcher?.setAttribute(
      "aria-label",
      this.#unread > 0 ? "Ouvrir la discussion (nouveau message)" : "Ouvrir la discussion",
    );
  }

  #trackUnread() {
    const messages = this.#ctx?.state?.messages ?? [];
    const last = messages[messages.length - 1];
    if (
      last !== undefined &&
      last.role === "assistant" &&
      last.id !== this.#lastSeenId &&
      this.#ctx?.state?.typing !== true
    ) {
      this.#unread = Math.max(1, this.#unread);
      this.#updateLauncherBadge();
    }
  }

  #openPanel() {
    if (this.#open || this.#ctx === undefined) return;
    this.#open = true;
    this.#unread = 0;
    this.#stick = true;
    this.#firstRender = true;
    this.#lastSeenId = this.#ctx.state.messages.at(-1)?.id ?? null;
    this.#ctx.actions.openWidget(OPEN_SIZE);
    this.#buildPanel();
    this.#updatePanel();
    this.#focusInput();
  }

  #closePanel() {
    if (!this.#open) return;
    this.#open = false;
    this.#finishing = false;
    window.clearTimeout(this.#finishTimer);
    this.#ctx?.actions.closeWidget();
    this.#panel = null;
    this.#launcher = null;
    this.#launcherBadge = null;
    this.#brandAvatar = null;
    this.#brandName = null;
    this.#brandSignature = null;
    this.#statusText = null;
    this.#statusDot = null;
    this.#finishButton = null;
    this.#log = null;
    this.#list = null;
    this.#typing = null;
    this.#empty = null;
    this.#messageNodes.clear();
    this.#composer = null;
    this.#input = null;
    this.#send = null;
    this.#hint = null;
    this.#done = null;
    this.#showLauncher();
  }

  #buildPanel() {
    const brandAvatar = el("span", { class: "brand-avatar" });
    const brandName = el("h2");
    const statusText = el("span", { text: "Assistant en ligne" });
    const statusDot = el("span", { class: "status-dot", "aria-hidden": "true" });
    const finishButton = el("button", { class: "finish", type: "button", text: "Terminer", hidden: "true" });
    const closeButton = el("button", {
      class: "icon-btn",
      type: "button",
      "aria-label": "Fermer",
    }, [icon("close", 18)]);
    finishButton.addEventListener("click", () => this.#requestFinish());
    closeButton.addEventListener("click", () => this.#closePanel());

    const header = el("header", { class: "head" }, [
      brandAvatar,
      el("div", { class: "head-copy" }, [
        brandName,
        el("span", { class: "status" }, [statusDot, statusText]),
      ]),
      el("div", { class: "head-actions" }, [finishButton, closeButton]),
    ]);

    const intro = el("div", { class: "intro" }, [
      icon("spark", 17),
      el("div", {}, [
        el("strong", { text: "Bienvenue" }),
        el("span", { text: "Décrivez votre demande. Je vous réponds directement ici." }),
      ]),
    ]);
    const list = el("ul", { class: "log-list" });
    const typing = el("div", { class: "typing", hidden: "true" });
    const empty = el("p", { class: "empty", text: "Posez votre première question pour démarrer." });
    const log = el("div", {
      class: "log",
      role: "log",
      "aria-live": "polite",
      "aria-label": "Conversation",
    }, [intro, list, typing, empty]);
    log.addEventListener("scroll", () => this.#onLogScroll(), { passive: true });

    const input = el("textarea", {
      placeholder: "Écrivez votre message…",
      rows: "1",
      maxlength: "4000",
      "aria-label": "Votre message",
    });
    const send = el("button", { class: "send", type: "submit", "aria-label": "Envoyer" }, [icon("send", 17)]);
    input.addEventListener("input", () => {
      this.#autoResize();
      this.#updateComposer();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.#submit();
      }
    });
    const hint = el("p", { class: "hint", text: "Entrée pour envoyer · Maj+Entrée pour un retour à la ligne" });
    const composer = el("form", { class: "composer" }, [
      el("div", { class: "composer-box" }, [input, send]),
      hint,
    ]);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });

    const done = el("div", { class: "done", hidden: "true", role: "status" }, [
      el("span", { class: "done-icon" }, [icon("check", 17)]),
      el("div", { class: "done-copy" }, [
        el("strong", { text: "Demande enregistrée" }),
        el("span", { text: "Merci, votre demande a bien été prise en compte." }),
      ]),
      el("button", { class: "done-close", type: "button", text: "Fermer", onclick: () => this.#closePanel() }),
    ]);

    const footer = el("div", { class: "footer" }, [composer, done]);
    const panel = el("section", { class: "panel", role: "dialog", "aria-modal": "false", "aria-label": "Discussion" }, [
      header,
      log,
      footer,
    ]);
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.#closePanel();
    });

    this.#brandAvatar = brandAvatar;
    this.#brandName = brandName;
    this.#statusText = statusText;
    this.#statusDot = statusDot;
    this.#finishButton = finishButton;
    this.#log = log;
    this.#list = list;
    this.#typing = typing;
    this.#empty = empty;
    this.#composer = composer;
    this.#input = input;
    this.#send = send;
    this.#hint = hint;
    this.#done = done;
    this.#panel = panel;
    this.#messageNodes.clear();
    this.#root.replaceChildren(this.#style, panel);
    this.#firstRender = true;
  }

  #updatePanel() {
    const ctx = this.#ctx;
    if (ctx === undefined || this.#panel === null) return;
    this.#applyTheme();

    const brandName = ctx.brand?.name?.trim() || "Assistant";
    const brandSignature = `${brandName}|${ctx.brand?.logoUrl ?? ""}`;
    if (this.#brandSignature !== brandSignature) {
      this.#brandSignature = brandSignature;
      this.#brandName.textContent = brandName;
      this.#brandAvatar.replaceChildren(
        ctx.brand?.logoUrl
          ? el("img", { src: ctx.brand.logoUrl, alt: "" })
          : el("span", { text: brandName.slice(0, 1).toUpperCase() }),
      );
    }
    const finalised = ctx.state.status === "finalisee";
    this.#statusText.textContent = finalised ? "Demande enregistrée" : "Assistant en ligne";
    this.#statusDot.classList.toggle("is-done", finalised);

    if (finalised && this.#finishing) {
      this.#finishing = false;
      window.clearTimeout(this.#finishTimer);
    }
    this.#renderMessages();
    this.#typing.hidden = !ctx.state.typing || finalised;
    this.#typing.replaceChildren();
    if (!this.#typing.hidden) {
      this.#typing.appendChild(
        el("div", { class: "typing-row" }, [
          el("span", { class: "avatar", "aria-hidden": "true", text: "IA" }),
          el("span", { class: "typing-bubble", "aria-label": "L'assistant écrit" }, [
            el("span"), el("span"), el("span"),
          ]),
        ]),
      );
    }
    this.#empty.hidden = ctx.state.messages.length > 0 || ctx.state.typing;
    this.#finishButton.hidden = finalised || ctx.state.messages.length === 0;
    this.#finishButton.disabled = this.#finishing || ctx.state.typing;
    this.#finishButton.textContent = this.#finishing ? "…" : "Terminer";
    this.#done.hidden = !finalised;
    this.#composer.hidden = finalised;
    this.#input.disabled = finalised;
    if (this.#hint !== null) {
      this.#hint.textContent = this.#finishing
        ? "Enregistrement de votre demande…"
        : "Entrée pour envoyer · Maj+Entrée pour un retour à la ligne";
    }
    this.#updateComposer();

    const last = ctx.state.messages.at(-1);
    if (last?.role === "user" || this.#stick) this.#scrollToBottom(!this.#firstRender);
    this.#firstRender = false;
    if (this.#open) {
      this.#lastSeenId = last?.id ?? this.#lastSeenId;
      this.#unread = 0;
    }
  }

  #renderMessages() {
    const messages = this.#ctx?.state?.messages ?? [];
    const current = new Set(messages.map((message) => message.id));
    for (const [id, node] of this.#messageNodes) {
      if (!current.has(id)) {
        node.remove();
        this.#messageNodes.delete(id);
      }
    }
    for (const message of messages) {
      const signature = messageSignature(message);
      let node = this.#messageNodes.get(message.id);
      if (node !== undefined && node.__onirSignature !== signature) {
        const replacement = this.#messageNode(message);
        node.replaceWith(replacement);
        node = replacement;
        this.#messageNodes.set(message.id, replacement);
      }
      if (node === undefined) {
        node = this.#messageNode(message);
        this.#messageNodes.set(message.id, node);
        this.#list.appendChild(node);
      }
    }
  }

  #messageNode(message) {
    const isUser = message.role === "user";
    const bubble = el("div", { class: "bubble" });
    if (isUser) {
      bubble.textContent = message.content;
    } else {
      renderMarkdown(bubble, message.content);
    }
    const body = el("div", { class: "msg-body" }, [
      bubble,
      ...(message.medias?.length ? [this.#mediaList(message.medias)] : []),
      el("span", { class: "msg-time", text: formatTime(message.at) }),
    ]);
    const node = el("li", { class: `msg ${isUser ? "user" : "assistant"}` }, [
      el("span", { class: "avatar", "aria-hidden": "true", text: isUser ? "Moi" : "IA" }),
      body,
    ]);
    node.__onirSignature = messageSignature(message);
    return node;
  }

  #mediaList(medias) {
    const list = el("ul", { class: "media-list" });
    for (const media of medias) {
      const item = el("li");
      if (media.type === "photo") {
        item.appendChild(
          el("button", {
            class: "media",
            type: "button",
            "aria-label": `Agrandir : ${media.libelle}`,
            onclick: () => this.#ctx?.actions.openMedia(media.url),
          }, [el("img", { src: media.url, alt: media.libelle, loading: "lazy" })]),
        );
      } else {
        item.appendChild(
          el("a", {
            class: "media-link",
            href: media.url,
            target: "_blank",
            rel: "noopener noreferrer",
            text: media.libelle,
          }),
        );
      }
      list.appendChild(item);
    }
    return list;
  }

  #submit() {
    const value = this.#input?.value.trim() ?? "";
    if (value === "" || this.#ctx === undefined) return;
    if (this.#ctx.state.status === "finalisee" || this.#ctx.state.typing || this.#finishing) return;
    this.#stick = true;
    this.#ctx.actions.sendMessage(value);
    this.#input.value = "";
    this.#autoResize();
    this.#updateComposer();
    this.#focusInput();
  }

  #requestFinish() {
    const ctx = this.#ctx;
    if (ctx === undefined || this.#finishing || ctx.state.typing || ctx.state.status === "finalisee") return;
    if (ctx.state.messages.length === 0) return;
    this.#finishing = true;
    this.#updatePanel();
    ctx.actions.finish();
    window.clearTimeout(this.#finishTimer);
    this.#finishTimer = window.setTimeout(() => {
      if (this.#ctx?.state.status !== "finalisee") {
        this.#finishing = false;
        this.#updatePanel();
      }
    }, 15000);
  }

  #updateComposer() {
    if (this.#send === null || this.#input === null) return;
    const finalised = this.#ctx?.state.status === "finalisee";
    const typing = this.#ctx?.state.typing === true;
    this.#send.disabled =
      finalised || typing || this.#finishing || this.#input.value.trim() === "";
  }

  #autoResize() {
    if (this.#input === null) return;
    this.#input.style.height = "auto";
    this.#input.style.height = `${Math.min(this.#input.scrollHeight, 104)}px`;
  }

  #focusInput() {
    if (this.#input === null) return;
    window.setTimeout(() => {
      this.#input?.focus();
      this.#autoResize();
    }, 0);
  }

  #onLogScroll() {
    if (this.#log === null || performance.now() < this.#programmaticUntil) return;
    this.#stick = this.#log.scrollHeight - this.#log.scrollTop - this.#log.clientHeight < 80;
  }

  #scrollToBottom(smooth) {
    if (this.#log === null) return;
    this.#stick = true;
    this.#programmaticUntil = performance.now() + (smooth ? 700 : 80);
    this.#log.scrollTo({
      top: this.#log.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, StarterWidget);
