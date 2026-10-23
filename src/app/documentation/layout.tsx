import type { ReactNode } from "react";
import { DocSidebar } from "@/components/documentation/DocSidebar";

/** Coquille commune des pages de documentation (en-tête + sommaire + contenu). */
export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="doc-public">
      <header className="doc-public-head">
        <a className="doc-brand" href="/">
          ONIR CMS
        </a>
        <div className="doc-head-actions">
          <a className="btn ghost small doc-head-docs" href="/documentation">
            Documentation
          </a>
          <a className="btn ghost small" href="/login">
            Se connecter
          </a>
        </div>
      </header>
      <div className="doc-shell">
        <DocSidebar />
        <main className="doc-content">{children}</main>
      </div>
    </div>
  );
}
