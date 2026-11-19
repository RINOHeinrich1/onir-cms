"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type LoaderPhase = "visible" | "leaving" | "hidden";

/**
 * Voile de chargement de la page (template visuel) : logo ONIR qui respire,
 * masqué dès que le template signale qu'il est prêt (`data-onirtech-ready`).
 */
export function TemplateLoader() {
  const [phase, setPhase] = useState<LoaderPhase>("visible");

  useEffect(() => {
    let interval: number | undefined;
    let hideTimer: number | undefined;
    let guard: number | undefined;

    const leave = (): void => {
      if (interval !== undefined) window.clearInterval(interval);
      if (guard !== undefined) window.clearTimeout(guard);
      setPhase("leaving");
      hideTimer = window.setTimeout(() => setPhase("hidden"), 850);
    };

    const isReady = (): boolean => document.querySelector("[data-onirtech-ready]") !== null;
    if (isReady()) {
      leave();
    } else {
      interval = window.setInterval(() => {
        if (isReady()) leave();
      }, 200);
      guard = window.setTimeout(leave, 9000);
    }

    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      if (guard !== undefined) window.clearTimeout(guard);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      className={`template-loader${phase === "leaving" ? " hide" : ""}`}
      role="status"
      aria-label="Chargement"
    >
      <span className="template-loader-ring" aria-hidden="true" />
      <span className="template-loader-ring r2" aria-hidden="true" />
      <span className="template-loader-logo">
        <Image src="/logo/onir-cms-light.webp" alt="ONIR CMS" width={600} height={177} priority />
      </span>
      <span className="sr-only">Chargement de la page…</span>
    </div>
  );
}
