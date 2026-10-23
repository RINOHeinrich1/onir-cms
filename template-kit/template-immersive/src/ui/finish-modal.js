// Modale de confirmation « Terminer » (séparée du bouton) + toast de confirmation.
// Le bouton du composer n'agit jamais directement : il ouvre cette modale, seule
// la confirmation explicite déclenche `finish` (génération de la fiche).
import { h, ICON_CHECK } from "../lib/dom.js";

/** Durée d'affichage du toast de confirmation (ms). */
export const TOAST_MS = 4500;

export function createFinishModal({ onConfirm }) {
  const cancelBtn = h("button", { class: "fghost", type: "button", text: "Annuler" });
  const confirmBtn = h("button", { class: "fgo", type: "button", text: "Terminer" });
  const modal = h("div", {
    class: "finishmodal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "finishtitle",
    "aria-describedby": "finishtext",
  }, [
    h("div", { class: "finishcard" }, [
      h("h3", { class: "finishtitle", id: "finishtitle", text: "Terminer la conversation ?" }),
      h("p", {
        class: "finishtext",
        id: "finishtext",
        text: "La fiche sera générée à partir de cet échange, puis la conversation sera clôturée.",
      }),
      h("div", { class: "finishbtns" }, [cancelBtn, confirmBtn]),
    ]),
  ]);

  const toast = h("div", { class: "finishtoast", role: "status" }, [
    h("span", { class: "ico", html: ICON_CHECK }),
    h("span", { text: "Votre fiche est en cours de génération." }),
  ]);

  let toastTimer = 0;
  let opener = null;

  const isOpen = () => modal.classList.contains("open");

  function close() {
    modal.classList.remove("open");
    opener?.focus?.();
    opener = null;
  }

  function open(from) {
    opener = from ?? null;
    modal.classList.add("open");
    confirmBtn.focus?.();
  }

  function showToast() {
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove("show"); toastTimer = 0; }, TOAST_MS);
  }

  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", () => { close(); onConfirm?.(); showToast(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  // Échap ferme la MODALE seulement : l'événement ne doit pas atteindre l'hôte
  // (qui, lui, fermerait tout le panneau de discussion).
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  });

  return {
    modal, toast, open, close, showToast, isOpen,
    dispose() { if (toastTimer) clearTimeout(toastTimer); toastTimer = 0; },
  };
}
