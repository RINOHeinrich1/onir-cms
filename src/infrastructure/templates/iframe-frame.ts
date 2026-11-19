import path from "node:path";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export type IframeFrameInput = {
  title: string;
  entry: string;
  integrity: string;
  element: string;
  versionRoot: string;
  /** Active l'inventaire et la sélection d'éléments pour l'éditeur WYSIWYG. */
  edit?: boolean;
};

/**
 * Bridge d'édition WYSIWYG optionnel (ADR-0002 du studio).
 * Injecté dans le document iframe, il expose les éléments rendus au studio
 * via postMessage et applique des surcharges en mémoire, sans toucher au bundle.
 */
function renderEditBridge(edit: boolean, element: string): string {
  return `<script type="module">
    const EDIT = ${jsonForScript(edit)};
    const ELEMENT = ${jsonForScript(element)};
    const overrides = new Map();
    let inventory = [];
    let index = new Map();
    let selectedId = null;
    let editEnabled = false;

    function send(type, payload) {
      parent.postMessage(
        { __onirtech: 1, type: type, payload: payload === undefined ? {} : payload },
        "*",
      );
    }

    function roleFor(tag) {
      if (/^(img|svg|video|canvas|picture)$/.test(tag)) return "media";
      if (/^(button|a|input|select|textarea)$/.test(tag)) return "action";
      if (/^(h1|h2|h3|h4|h5|h6|p|span|strong|em|li|blockquote)$/.test(tag)) return "text";
      if (/^(section|article|header|footer|nav|main|aside|div|form)$/.test(tag)) return "container";
      return "other";
    }

    function labelFor(el) {
      const raw =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        el.textContent ||
        "";
      const text = raw.replace(/\\s+/g, " ").trim();
      return text.slice(0, 48) || el.tagName.toLowerCase();
    }

    function pathFor(el) {
      const parts = [];
      let current = el;
      while (current && current.nodeType === 1 && current.tagName !== "BODY") {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (child) => child.tagName === current.tagName,
          );
          if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
        parts.unshift(part);
        const root = current.getRootNode();
        current = parent || (root && root.host ? root.host : null);
      }
      return parts.join(">");
    }

    function rectOf(el) {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }

    function collect() {
      const found = [];
      const visited = new Set();
      function scan(root) {
        for (const el of Array.from(root.querySelectorAll("*"))) {
          if (visited.has(el)) continue;
          visited.add(el);
          const tag = el.tagName.toLowerCase();
          if (el.id === "onirtech-template-root" || tag === ELEMENT) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 6 || rect.height < 6) continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
          found.push({
            el,
            info: {
              id: pathFor(el),
              tag,
              label: labelFor(el),
              role: roleFor(tag),
              rect: rectOf(el),
            },
          });
          if (el.shadowRoot) scan(el.shadowRoot);
        }
      }
      scan(document);
      return found.slice(0, 200);
    }

    function applyOverride(entry) {
      const el = index.get(entry.elementId);
      if (!el) return;
      el.style.translate = (entry.x || 0) + "px " + (entry.y || 0) + "px";
      if (entry.width !== undefined && entry.width !== null) el.style.width = entry.width + "px";
      if (entry.height !== undefined && entry.height !== null) el.style.height = entry.height + "px";
      if (entry.color !== undefined) el.style.color = entry.color;
      if (entry.background !== undefined) el.style.backgroundColor = entry.background;
      if (entry.fontSize !== undefined && entry.fontSize !== null) el.style.fontSize = entry.fontSize + "px";
      el.style.display = entry.hidden ? "none" : "";
      overrides.set(entry.elementId, entry);
    }

    function applyAll() {
      for (const entry of overrides.values()) applyOverride(entry);
    }

    function emitInventory() {
      send("studioElements", { elements: inventory.map((item) => item.info) });
    }

    function rebuild() {
      inventory = collect();
      index = new Map();
      for (const item of inventory) index.set(item.info.id, item.el);
      applyAll();
      if (EDIT && editEnabled) emitInventory();
    }

    document.addEventListener(
      "click",
      (event) => {
        if (!editEnabled) return;
        const target = event.target;
        if (!target || target.nodeType !== 1) return;
        let best = null;
        let bestArea = Infinity;
        for (const item of inventory) {
          if (item.el === target || item.el.contains(target)) {
            const r = item.el.getBoundingClientRect();
            const area = r.width * r.height;
            if (area < bestArea) {
              bestArea = area;
              best = item;
            }
          }
        }
        if (!best) return;
        event.preventDefault();
        event.stopPropagation();
        selectedId = best.info.id;
        send("studioSelection", { id: selectedId, rect: rectOf(best.el) });
      },
      true,
    );

    window.addEventListener("message", (event) => {
      if (event.source !== parent) return;
      const message = event.data;
      if (!message || typeof message !== "object" || message.__onirtech !== 1) return;

      if (message.type === "studioEnable") {
        editEnabled = true;
        rebuild();
        emitInventory();
        return;
      }
      if (message.type === "studioList") {
        rebuild();
        emitInventory();
        return;
      }
      if (message.type === "studioApplyOverrides") {
        overrides.clear();
        const list = (message.payload && message.payload.overrides) || [];
        for (const item of list) overrides.set(item.elementId, item);
        applyAll();
        return;
      }
      if (message.type === "studioSelect") {
        selectedId = (message.payload && message.payload.id) || null;
        const el = selectedId ? index.get(selectedId) : null;
        send("studioSelection", el ? { id: selectedId, rect: rectOf(el) } : null);
        return;
      }
      if (message.type === "studioMove") {
        const id = message.payload && message.payload.id;
        const el = id ? index.get(id) : null;
        if (!el || !id) return;
        const current = overrides.get(id) || { elementId: id, x: 0, y: 0 };
        current.x = Math.round((current.x || 0) + Number(message.payload.dx || 0));
        current.y = Math.round((current.y || 0) + Number(message.payload.dy || 0));
        overrides.set(id, current);
        applyOverride(current);
        send("studioChange", { id, patch: current, rect: rectOf(el) });
        return;
      }
      if (message.type === "studioPatch") {
        const id = message.payload && message.payload.id;
        const el = id ? index.get(id) : null;
        if (!el || !id) return;
        const current = { ...(overrides.get(id) || { elementId: id }), ...(message.payload.patch || {}) };
        overrides.set(id, current);
        applyOverride(current);
        send("studioChange", { id, patch: current, rect: rectOf(el) });
      }
    });

    new MutationObserver(() => {
      if (EDIT && editEnabled) rebuild();
    }).observe(document.body, { childList: true, subtree: true });

    customElements.whenDefined(ELEMENT).then(() => setTimeout(rebuild, 120)).catch(() => {});
  </script>`;
}

/**
 * Document hôte d'une iframe template (ADR-0090).
 * Le code du template reste dans l'iframe sandboxée ; ce document est contrôlé
 * par la plateforme et sert uniquement de pont contexte/actions/data.
 */
export function renderIframeFrame(input: IframeFrameInput): string {
  const entryDirectory = path.posix.dirname(input.entry);
  const baseHref = `${input.versionRoot}${entryDirectory === "." ? "" : `${entryDirectory}/`}`;
  const entryFile = path.posix.basename(input.entry);
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeAttribute(baseHref)}">
  <title>${escapeAttribute(input.title)}</title>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100%; background: transparent; }
    #onirtech-template-root { min-height: 100%; }
  </style>
</head>
<body>
  <div id="onirtech-template-root"></div>
  <script type="module" src="${escapeAttribute(entryFile)}" integrity="${escapeAttribute(input.integrity)}" crossorigin="anonymous"></script>
  <script type="module">
    const ELEMENT = ${jsonForScript(input.element)};
    const listeners = new Map();
    const pending = new Map();
    let nextRequestId = 0;
    let element = null;
    let currentContext = null;
    let readyTimer = null;
    let initReceived = false;

    function send(action, payload) {
      parent.postMessage({ __onirtech: 1, action, payload }, "*");
    }

    const actions = {
      submitIdentity(data) { send("submitIdentity", data); },
      sendMessage(content, attachmentIds) {
        send("sendMessage", {
          content,
          ...(attachmentIds === undefined ? {} : { attachmentIds }),
        });
      },
      async attachFile(fieldName, file) {
        const data = await file.arrayBuffer();
        send("attachFile", { fieldName, name: file.name, mime: file.type, data });
      },
      removeAttachment(attachmentId) { send("removeAttachment", { attachmentId }); },
      finish() { send("finish"); },
      selectFallback(questionId) { send("selectFallback", { questionId }); },
      openCollectionForm(payload) { send("openCollectionForm", payload ?? {}); },
      async submitCollection(payload) { send("submitCollection", payload); },
      request(capability) { send("request", { capability }); return Promise.resolve(undefined); },
      openMedia(url) { send("openMedia", { url }); },
      resize(height) { send("resize", { height }); },
      openWidget(options) { send("openWidget", options ?? {}); },
      closeWidget() { send("closeWidget"); },
    };

    const data = {
      load(key, options) {
        const requestId = "data-" + ++nextRequestId;
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (!pending.delete(requestId)) return;
            resolve({ status: "error", code: "DATA_TIMEOUT", message: "Délai dépassé" });
          }, 30000);
          pending.set(requestId, (result) => {
            clearTimeout(timeout);
            resolve(result);
          });
          send("loadData", {
            requestId,
            contract: key,
            ...(options?.inputs === undefined ? {} : { inputs: options.inputs }),
          });
        });
      },
    };

    function emitToListeners(event, payload) {
      for (const callback of listeners.get(event) ?? []) callback(payload);
    }

    function makeContext(context) {
      return {
        ...context,
        actions,
        data,
        on(event, callback) {
          const set = listeners.get(event) ?? new Set();
          set.add(callback);
          listeners.set(event, set);
          return () => set.delete(callback);
        },
      };
    }

    function applyContext() {
      if (currentContext === null) return;
      if (element !== null) element.onirtechContext = makeContext(currentContext);
      emitToListeners("state", currentContext.state);
      emitToListeners("resources", currentContext.resources);
    }

    function mount() {
      if (!customElements.get(ELEMENT)) {
        setTimeout(mount, 20);
        return;
      }
      if (element === null) {
        element = document.createElement(ELEMENT);
        document.getElementById("onirtech-template-root").replaceChildren(element);
        new ResizeObserver(() => {
          send("resize", { height: Math.ceil(element.getBoundingClientRect().height) });
        }).observe(element);
      }
      applyContext();
      parent.postMessage({ __onirtech: 1, action: "ready" }, "*");
      if (readyTimer === null) {
        readyTimer = setInterval(() => {
          parent.postMessage({ __onirtech: 1, action: "ready" }, "*");
        }, 250);
      }
    }

    window.addEventListener("message", (event) => {
      if (event.source !== parent) return;
      const message = event.data;
      if (message === null || typeof message !== "object" || message.__onirtech !== 1) return;
      if (message.type === "init") {
        const firstInit = !initReceived;
        initReceived = true;
        if (readyTimer !== null) {
          clearInterval(readyTimer);
          readyTimer = null;
        }
        currentContext = message.context;
        applyContext();
        if (firstInit) {
          parent.postMessage({ __onirtech: 1, action: "ready" }, "*");
        }
        return;
      }
      if (message.type === "dataResult") {
        const resolve = pending.get(message.payload?.requestId);
        if (resolve !== undefined) {
          pending.delete(message.payload.requestId);
          resolve(message.payload.result);
        }
      }
    });

    customElements.whenDefined(ELEMENT).then(mount).catch(() => {
      parent.postMessage(
        { __onirtech: 1, action: "resize", payload: { height: 0 } },
        "*",
      );
    });
  </script>
  ${renderEditBridge(input.edit ?? false, input.element)}
</body>
</html>`;
}
