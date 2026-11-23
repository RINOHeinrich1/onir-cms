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
};

/**
 * Document hôte d'une iframe template (ADR-0091).
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

    let editorActive = false;
    let editorHover = null;
    let editorSelected = null;

    function editorRoots() {
      const roots = [document];
      if (element !== null && element.shadowRoot !== null) roots.push(element.shadowRoot);
      return roots;
    }

    function editorElements() {
      const nodes = [];
      for (const root of editorRoots()) {
        for (const node of root.querySelectorAll("[data-onir-region]")) nodes.push(node);
      }
      return nodes;
    }

    function editorRegionFromEvent(event) {
      for (const node of event.composedPath()) {
        if (!(node instanceof HTMLElement)) continue;
        const region = node.dataset.onirRegion;
        if (region !== undefined && region !== "") return region;
      }
      return null;
    }

    function applyEditorStyles() {
      for (const node of editorElements()) {
        const region = node.dataset.onirRegion ?? "";
        const selected = region === editorSelected;
        const hover = region === editorHover && !selected;
        node.style.outline = selected
          ? "2px solid #f59e0b"
          : hover
            ? "2px solid #4f8cff"
            : "";
        node.style.outlineOffset = selected || hover ? "3px" : "";
      }
    }

    function sendEditor(event, regionId) {
      parent.postMessage(
        { __onirtech: 1, type: "editor", event, regionId },
        "*",
      );
    }

    document.addEventListener("pointerover", (event) => {
      if (!editorActive) return;
      const region = editorRegionFromEvent(event);
      if (region === editorHover) return;
      editorHover = region;
      applyEditorStyles();
      sendEditor("hover", region);
    }, true);

    document.addEventListener("click", (event) => {
      if (!editorActive) return;
      const region = editorRegionFromEvent(event);
      if (region === null) return;
      event.preventDefault();
      event.stopPropagation();
      editorSelected = region;
      applyEditorStyles();
      sendEditor("select", region);
    }, true);

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
      applyEditorStyles();
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
      if (message.type === "editor") {
        if (message.command === "set-active") {
          editorActive = message.active === true;
          editorSelected =
            typeof message.selectedRegion === "string" ? message.selectedRegion : null;
          editorHover = null;
          applyEditorStyles();
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
</body>
</html>`;
}
