"use client";

export type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Confirmation impérative et accessible, en remplacement de window.confirm.
 * Le dialogue piège le focus, se ferme par Échap et restaure le focus initial.
 */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const card = document.createElement("div");
    card.className = "confirm-card";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "confirm-title");
    card.setAttribute("aria-describedby", "confirm-message");
    card.tabIndex = -1;

    const title = document.createElement("h2");
    title.id = "confirm-title";
    title.textContent = options.title ?? "Confirmer l’action";

    const body = document.createElement("p");
    body.id = "confirm-message";
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn ghost small";
    cancel.textContent = options.cancelLabel ?? "Annuler";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = options.danger === false ? "btn small" : "btn danger small";
    confirm.textContent = options.confirmLabel ?? "Confirmer";

    actions.append(cancel, confirm);
    card.append(title, body, actions);
    overlay.append(card);
    document.body.append(overlay);

    const close = (value: boolean): void => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected === true) previous.focus();
      resolve(value);
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (elements.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(false);
    });
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    cancel.focus();
  });
}
