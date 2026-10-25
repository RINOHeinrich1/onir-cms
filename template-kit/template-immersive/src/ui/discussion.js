// Overlay discussion : tableau, dialogue PAGINÉ (hauteur fixe, sans scroll),
// frappe progressive, navigation page → message, composer, barre d'actions.
import { h, ICON_ATTACH, ICON_CHECK, ICON_SEND } from "../lib/dom.js";
import { acceptAttribute, attachmentsHtml, canAddFiles, fileFields, formatFileSize } from "../lib/attachments.js";
import { mdToHtml } from "../lib/markdown.js";
import { PAGE_MARK, pageLabel, resolveNav } from "../lib/pagination.js";
import { TYPE_PAGE_PAUSE_MS } from "../lib/typewriter.js";
import { createActionButtons } from "./action-buttons.js";
import { createFinishModal } from "./finish-modal.js";
import { paginateBubble } from "./pagination.js";
import { typeInto } from "./typewriter-dom.js";

const reduceMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function markSpan(mark, extraClass) {
  const span = h("span", { class: extraClass, "data-static": "1" });
  span.textContent = mark;
  return span;
}

export function createDiscussionUI({ root, board, onDiscuss, onAlbum, onLibrary, onSend, onAttach, onRemoveAttachment, getFileFields, onFinish, onExit, onReset, onNavigate, onToggleBoard }) {
  const dialogue = h("div", { class: "dialogue" });
  const liveRegion = h("div", { class: "sr-live", "aria-live": "polite" });
  const bubble = h("div", { class: "bubble assistant" });
  const input = h("input", { type: "text", placeholder: "Votre message…", "aria-label": "Votre message" });
  let pending = [];
  let attachFields = [];
  let attachBusy = false;
  let pickedField = null;
  const fileInput = h("input", { type: "file", class: "cfiles", tabindex: "-1", "aria-hidden": "true" });
  const attachMenu = h("div", { class: "attachmenu", role: "menu" });
  const attachBtn = h("button", {
    class: "cattach", type: "button", title: "Joindre une pièce", "aria-label": "Joindre une pièce",
    onclick: () => chooseField(),
  }, [h("span", { class: "ico", html: ICON_ATTACH }), h("span", { class: "lbl", text: "Joindre" })]);
  const attachStatus = h("span", { class: "attachstatus", role: "status" });
  const attachChips = h("div", { class: "attachchips" });
  const attachPending = h("div", { class: "attachpending", "aria-live": "polite" }, [attachStatus, attachChips]);
  const send = () => {
    const value = input.value.trim();
    if (attachBusy || (!value && pending.length === 0)) return;
    onSend(value);
    input.value = "";
    updateSendState();
  };
  input.addEventListener("input", updateSendState);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  const sendBtn = h("button", { class: "csend", type: "button", "aria-label": "Envoyer", onclick: send }, [
    h("span", { class: "ico", html: ICON_SEND }),
    h("span", { class: "lbl", text: "Envoyer" }),
  ]);
  const finishBtn = h("button", {
    class: "cfinish", type: "button", title: "Terminer la conversation et générer la fiche",
    "aria-label": "Terminer la conversation et générer la fiche", onclick: () => finishModal.open(finishBtn),
  }, [
    h("span", { class: "ico", html: ICON_CHECK }),
    h("span", { class: "lbl", text: "Terminer" }),
  ]);
  function updateSendState() {
    const hasText = input.value.trim() !== "";
    sendBtn.disabled = attachBusy || (!hasText && pending.length === 0);
    attachBtn.disabled = attachBusy || attachFields.length === 0;
    attachBtn.hidden = attachFields.length === 0;
  }

  function setStatus(message) {
    attachStatus.textContent = message;
    attachStatus.classList.toggle("error", message !== "" && !message.startsWith("Envoi"));
    attachPending.classList.toggle("show", pending.length > 0 || message !== "");
  }

  function closeMenu() { attachMenu.classList.remove("open"); }

  function chooseField() {
    if (attachBusy) return;
    if (attachMenu.classList.contains("open")) { closeMenu(); return; }
    const fields = fileFields(getFileFields?.() ?? attachFields);
    if (fields.length === 0) return;
    if (fields.length === 1) { pickField(fields[0]); return; }
    attachMenu.replaceChildren(...fields.map((field) => h("button", {
      type: "button", role: "menuitem", text: field.label || field.name,
      onclick: () => pickField(field),
    })));
    attachMenu.classList.add("open");
  }

  function pickField(field) {
    closeMenu();
    pickedField = field;
    fileInput.setAttribute("accept", acceptAttribute(field));
    fileInput.multiple = (field.maxFiles ?? 1) > 1;
    fileInput.value = "";
    fileInput.click();
  }

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    const field = pickedField;
    fileInput.value = "";
    if (!field || files.length === 0) return;
    const check = canAddFiles(field, pending, files);
    if (!check.ok) {
      setStatus(check.error);
      liveRegion.textContent = check.error;
      return;
    }
    attachBusy = true;
    setStatus(`Envoi de ${files.length} fichier${files.length > 1 ? "s" : ""}…`);
    updateSendState();
    void Promise.allSettled(files.map((file) => Promise.resolve(onAttach(field.name, file)))).then(() => {
      attachBusy = false;
      setStatus("");
      updateSendState();
    });
  });

  function renderPending() {
    attachChips.replaceChildren(...pending.map((item) => h("span", { class: "attachchip" }, [
      h("span", { class: "attachlabel", text: `${item.originalName} · ${formatFileSize(item.sizeBytes)}` }),
      h("button", {
        type: "button", class: "attachremove", "aria-label": `Retirer ${item.originalName}`,
        text: "×", onclick: () => onRemoveAttachment?.(item.id),
      }),
    ])));
    attachPending.classList.toggle("show", pending.length > 0 || attachStatus.textContent !== "");
  }

  function setAttachments(nextPending, modelForm) {
    pending = Array.isArray(nextPending) ? nextPending : [];
    attachFields = fileFields(modelForm);
    renderPending();
    updateSendState();
  }

    const composer = h("div", { class: "composer" }, [attachBtn, input, finishBtn, sendBtn, fileInput, attachMenu]);
  const finishModal = createFinishModal({
    onConfirm: () => {
      liveRegion.textContent = "Conversation terminée : génération de la fiche en cours.";
      onFinish?.();
    },
  });
  const prev = h("button", { class: "dnav prev", "aria-label": "Message ou page précédent", text: "‹", onclick: () => navigate(-1) });
  const next = h("button", { class: "dnav next", "aria-label": "Message ou page suivant", text: "›", onclick: () => navigate(1) });
  const folio = h("span", { class: "dfolio" });
  const discnav = h("div", { class: "discnav" }, [prev, folio, next]);
  const toggle = h("button", {
    class: "boardtoggle", type: "button", text: "Tableau", "aria-expanded": "false",
    onclick: () => { toggleBoard(); onToggleBoard?.(); },
  });
  const el = h("div", { class: "discussion" }, [
    h("button", { class: "dclose", text: "← Retour à la salle", onclick: () => onExit() }),
    h("button", { class: "dreset", text: "Changer d'identité", onclick: () => onReset() }),
    toggle,
    board.el,
    h("div", { class: "discbottom" }, [dialogue, liveRegion, discnav, attachPending, composer]),
  ]);
  const actionsEl = h("div", { class: "actions" }, createActionButtons({ onDiscuss, onAlbum, onLibrary }));
  root.append(actionsEl, el, finishModal.modal, finishModal.toast);

  // ---- État de pagination / frappe ----------------------------------------
  let view = { count: 0, idx: 0, message: null };
  let pages = [];
  let pageIdx = 0;
  let role = "assistant";
  let msgKey = "none";
  let contentPrint = "";
  let typing = null;
  let autoTimer = 0;
  let auto = true;
  let pendingAnimate = true;
  let landLast = false;
  let lastBox = { w: 0, h: 0 };

  bubble.addEventListener("click", () => {
    if (!typing) return;
    auto = false;
    typing.finish();
    typing = null;
    updateNav();
  });

  function clearAuto() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
  }

  function measureBox() {
    if (!bubble.isConnected) dialogue.appendChild(bubble);
    lastBox = { w: bubble.clientWidth, h: bubble.clientHeight };
    return { width: lastBox.w, height: lastBox.h };
  }

  function onPageTyped() {
    typing = null;
    updateNav();
    if (!auto || pageIdx >= pages.length - 1) return;
    clearAuto();
    autoTimer = setTimeout(() => {
      autoTimer = 0;
      if (!auto) return;
      showPage(pageIdx + 1, { animate: true });
    }, TYPE_PAGE_PAUSE_MS);
  }

  function pageText(page) {
    if (!page) return "";
    const wrapper = document.createElement("div");
    wrapper.append(...page.nodes.map((n) => n.cloneNode(true)));
    return wrapper.textContent ?? "";
  }

  function showPage(target, { animate = true } = {}) {
    clearAuto();
    if (typing) { typing.cancel(); typing = null; }
    if (pages.length === 0) {
      pageIdx = 0;
      bubble.remove();
      liveRegion.textContent = "";
      updateNav();
      return;
    }
    pageIdx = Math.max(0, Math.min(target, pages.length - 1));
    const page = pages[pageIdx];
    const html = page.nodes.map((n) => n.cloneNode(true));
    const nodes = [];
    if (page.mark) nodes.push(markSpan(`${page.mark} `, "cont-start"));
    nodes.push(...html);
    if (pageIdx < pages.length - 1) nodes.push(markSpan(PAGE_MARK, "cont-end"));

    bubble.dataset.page = String(pageIdx + 1);
    bubble.dataset.pages = String(pages.length);
    bubble.replaceChildren(...nodes);
    bubble.setAttribute("aria-hidden", "true");
    liveRegion.textContent = `${pageIdx > 0 ? `${PAGE_MARK} ` : ""}${pageText(page)}${pageIdx < pages.length - 1 ? ` ${PAGE_MARK}` : ""}`;
    if (!bubble.isConnected) dialogue.appendChild(bubble);

    const animated = animate && !reduceMotion();
    if (animated) typing = typeInto(bubble, { onDone: onPageTyped });
    else { bubble.classList.remove("typing"); bubble.removeAttribute("data-typing"); }
    updateNav();
  }

  function messageHtml(message) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    const content = message?.content || (attachments.length > 0 ? "" : PAGE_MARK);
    return `${mdToHtml(content)}${attachmentsHtml(attachments)}`;
  }

  function startMessage(message, { animate = true } = {}) {
    clearAuto();
    if (typing) { typing.cancel(); typing = null; }
    auto = true;
    role = message?.role === "assistant" ? "assistant" : "user";
    bubble.className = `bubble ${role}`;
    if (!message) {
      pages = [];
      showPage(0);
      return;
    }
    const { width, height } = measureBox();
    pages = paginateBubble({
      host: dialogue, role, width, height,
      html: messageHtml(message),
    });
    pageIdx = landLast && pages.length > 0 ? pages.length - 1 : 0;
    landLast = false;
    // Pas de frappe « dans le vide » : la scène fermée affiche instantanément.
    const visible = el.classList.contains("open") && width > 8 && height > 8;
    showPage(pageIdx, { animate: animate && visible && pageIdx === 0 });
  }

  function repaginate({ animate = false, force = false } = {}) {
    if (!view.message) return;
    if (!force && bubble.isConnected) {
      const same = bubble.clientWidth === lastBox.w && bubble.clientHeight === lastBox.h;
      if (same && pages.length > 0) return;
    }
    const { width, height } = measureBox();
    pages = paginateBubble({
      host: dialogue, role, width, height,
      html: messageHtml(view.message),
    });
    pageIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
    showPage(pageIdx, { animate });
  }

  function updateNav() {
    const pageCount = pages.length || 1;
    const base = { typing: !!typing, pageIdx, pageCount, msgIdx: view.idx, msgCount: view.count };
    prev.disabled = resolveNav({ ...base, delta: -1 }) === "none";
    next.disabled = resolveNav({ ...base, delta: 1 }) === "none";
    folio.textContent = pageLabel({ msgIdx: view.idx, msgCount: view.count, pageIdx, pageCount });
    if (typing) bubble.dataset.typing = "1";
    else bubble.removeAttribute("data-typing");
  }

  /** ‹ › : termine la frappe, sinon page suivante/précédente, sinon message. */
  function navigate(delta) {
    auto = false;
    const state = { pageIdx, pageCount: pages.length || 1, msgIdx: view.idx, msgCount: view.count, delta };
    let action = resolveNav({ ...state, typing: !!typing });
    if (action === "finish") {
      // Un appui explicite TERMINE la frappe puis applique le déplacement demandé
      // (un seul geste, pas deux).
      typing?.finish();
      typing = null;
      action = resolveNav({ ...state, typing: false });
    }
    if (action === "page") {
      showPage(pageIdx + delta, { animate: delta > 0 });
      return;
    }
    if (action === "message") {
      pendingAnimate = false;
      landLast = delta < 0;
      onNavigate(delta);
    }
  }

  function render(messages, msgIndex, asst, resources) {
    view = { count: messages.length, idx: msgIndex, message: messages[msgIndex] ?? null };
    board.render(asst, resources);
    const message = view.message;
    const key = message ? `${msgIndex}|${message.id ?? ""}` : "none";
    const print = `${message?.content ?? ""}|${(message?.attachments ?? []).map((item) => item.id).join(",")}`;
    if (key !== msgKey) {
      msgKey = key;
      contentPrint = print;
      const animate = pendingAnimate;
      pendingAnimate = true;
      startMessage(message, { animate });
    } else if (print !== contentPrint) {
      contentPrint = print;
      repaginate({ animate: false });
    } else {
      updateNav();
    }
  }

  function updateToggle() {
    const open = el.classList.contains("narrowboard-open");
    toggle.textContent = open ? "Masquer le tableau" : "Tableau";
    toggle.setAttribute("aria-expanded", String(open));
  }

  function toggleBoard() {
    el.classList.toggle("narrowboard-open");
    updateToggle();
    if (el.classList.contains("narrowboard-open")) repaginate({ animate: false });
  }

  function setNarrow(narrow) {
    const changed = el.classList.toggle("narrowboard", narrow);
    if (!narrow) el.classList.remove("narrowboard-open");
    updateToggle();
    if (changed) repaginate({ animate: false });
  }

  // Le zoom navigateur, la barre d'URL ou le clavier modifient la hauteur
  // réellement disponible sans toujours déclencher window.resize. On observe
  // la boîte de dialogue et on repagine sur sa taille réelle.
  let resizeRaf = 0;
  const scheduleRepaginate = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      if (el.classList.contains("open")) repaginate({ animate: false, force: true });
    });
  };
  const resizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(scheduleRepaginate) : null;
  resizeObserver?.observe(dialogue);

  return {
    el, actionsEl, input,
    panelHeight() { return el.querySelector(".discbottom")?.getBoundingClientRect().height ?? 0; },
    open() { el.classList.add("open"); el.classList.remove("narrowboard-open"); },
    close() { el.classList.remove("open"); clearAuto(); typing?.cancel(); typing = null; finishModal.close(); closeMenu(); },
    render,
    setAttachments,
    renderDialogue(message) { startMessage(message, { animate: false }); },
    setReact() { /* conservé pour compatibilité */ },
    setNarrow,
    setActionsVisible(visible) { actionsEl.classList.toggle("show", visible); },
    updateToggle,
    toggleBoard,
    nav: navigate,
    repaginate,
  };
}
