"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modale centrée réutilisable : focus piégé, restitution du focus au déclencheur,
 * fermeture par Échap et blocage du scroll de la page.
 */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  dialogClassName,
  bodyClassName,
  overlayClassName,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dialogClassName?: string;
  bodyClassName?: string;
  overlayClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus();

    const focusables = (): HTMLElement[] => {
      if (dialog === null) return [];
      return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
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
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected === true) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={
        overlayClassName === undefined ? "modal-overlay" : `modal-overlay ${overlayClassName}`
      }
    >
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className={[
          "modal",
          wide ? "wide" : "",
          dialogClassName === undefined ? "" : dialogClassName,
        ]
          .filter((entry) => entry !== "")
          .join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className={bodyClassName === undefined ? "modal-body" : `modal-body ${bodyClassName}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
