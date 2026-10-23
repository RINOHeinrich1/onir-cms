"use client";

import { useState } from "react";

/** Bloc de code avec bouton « Copier » (clipboard + repli execCommand). */
export function DocCode({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
    } catch {
      const area = document.createElement("textarea");
      area.value = children;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="doc-code-wrap">
      <button type="button" className="doc-copy" onClick={copy} aria-label="Copier le code">
        {copied ? "Copié ✓" : "Copier"}
      </button>
      <pre className="doc-code">
        <code>{children}</code>
      </pre>
    </div>
  );
}
