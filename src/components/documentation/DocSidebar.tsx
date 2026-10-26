"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

const SECTIONS = [
  {
    title: "Démarrer",
    items: [
      { href: "/documentation", label: "Introduction" },
      { href: "/documentation/installation", label: "Docker local & GHCR" },
      { href: "/documentation/first-template", label: "Votre premier template" },
    ],
  },
  {
    title: "Référence",
    items: [
      { href: "/documentation/sdk", label: "SDK JavaScript" },
      { href: "/documentation/actions", label: "Actions" },
      { href: "/documentation/host", label: "Données & hôte" },
      { href: "/documentation/templates-visuels", label: "Contrat des templates" },
      { href: "/documentation/api", label: "API fiches" },
    ],
  },
  {
    title: "Pour les agents IA",
    items: [{ href: "/documentation/skill", label: "Skill SDK" }],
  },
];

/** Sommaire latéral de la documentation (repliable sur mobile). */
export function DocSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="doc-nav-toggle"
        aria-expanded={open}
        aria-controls="doc-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Fermer le sommaire" : "Sommaire"}
      </button>
      <aside className={`doc-sidebar${open ? " is-open" : ""}`}>
        <nav id="doc-nav" className="doc-nav" aria-label="Documentation">
          {SECTIONS.map((section) => (
            <div key={section.title} className="doc-nav-section">
              <p className="doc-nav-title">{section.title}</p>
              <ul>
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={active ? "is-active" : undefined}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
