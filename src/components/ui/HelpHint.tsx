"use client";

import type { ReactNode } from "react";

/** Aide courte affichée dans une bulle, sans alourdir le formulaire. */
export function HelpHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="help-hint">
      <button type="button" className="help-hint-trigger" aria-label={label}>
        ?
      </button>
      <span className="help-hint-bubble" role="tooltip">
        {children}
      </span>
    </span>
  );
}
