"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Menu d'actions flottant, rendu dans un portail et repositionné au-dessus
 * du bas de l'écran quand la place manque.
 */
export function FloatingMenu({
  label,
  children,
  triggerClassName = "icon-btn",
  panelClassName = "",
}: {
  label: string;
  children: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((): void => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = (): void => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (trigger === null || panel === null) return;
      const rect = trigger.getBoundingClientRect();
      const panelHeight = panel.offsetHeight;
      const panelWidth = panel.offsetWidth;
      const gap = 6;
      const margin = 8;
      const top =
        rect.bottom + gap + panelHeight > window.innerHeight - margin
          ? Math.max(margin, rect.top - panelHeight - gap)
          : rect.bottom + gap;
      const left = Math.min(
        Math.max(margin, rect.right - panelWidth),
        window.innerWidth - panelWidth - margin,
      );
      setPosition({ top, left });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", close, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={`action-menu-panel floating-action-panel ${panelClassName}`.trim()}
              role="menu"
              style={
                position === null
                  ? { top: 0, left: 0, visibility: "hidden" }
                  : { top: position.top, left: position.left }
              }
              onClick={() => close()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") close();
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
