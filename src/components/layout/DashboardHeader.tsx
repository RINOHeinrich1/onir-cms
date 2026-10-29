"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { OrganizationSwitcher } from "@/components/organizations/OrganizationSwitcher";
import type { Role } from "@/domain/entities/user";
import { type Action, can } from "@/domain/rbac";
import { AccountMenu } from "./AccountMenu";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  prospects: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  links: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  conversations: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  leads: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 3h6v4H9z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  fichesCollecte: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  connaissances: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </>
  ),
  medias: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  categories: (
    <>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1" />
    </>
  ),
  confidentialites: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  templates: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  ai: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </>
  ),
  keys: (
    <>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6M15.5 7.5l3 3" />
    </>
  ),
  webhooks: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
    </>
  ),
  documentation: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  organisations: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </>
  ),
  utilisateurs: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  invitations: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </>
  ),
  configuration: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

type NavIconName = keyof typeof ICONS;

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  action: Action;
  icon: NavIconName;
};

const ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Vue globale", action: "dashboard:view", icon: "dashboard" },
  { href: "/liens", label: "Chatbots", action: "links:list", icon: "links" },
  { href: "/prospects", label: "Prospects", action: "prospects:list", icon: "prospects" },
  {
    href: "/conversations",
    label: "Conversations",
    action: "conversations:list",
    icon: "conversations",
  },
  { href: "/leads", label: "Leads", action: "project:read", icon: "leads" },
  {
    href: "/fiches-collecte",
    label: "Fiches de collecte",
    action: "fiches_collecte:list",
    icon: "fichesCollecte",
  },
  {
    href: "/connaissances",
    label: "Connaissances",
    action: "connaissances:list",
    icon: "connaissances",
  },
  { href: "/medias", label: "Médias", action: "medias:list", icon: "medias" },
  { href: "/categories", label: "Catégories", action: "categories:list", icon: "categories" },
  {
    href: "/confidentialites",
    label: "Confidentialité",
    action: "confidentialites:list",
    icon: "confidentialites",
  },
  {
    href: "/templates-visuels",
    label: "Templates visuels",
    action: "visualtemplates:list",
    icon: "templates",
  },
  { href: "/parametres/ia", label: "Paramètres IA", action: "ai:list", icon: "ai" },
  { href: "/parametres/api-keys", label: "Clés API", action: "api_keys:list", icon: "keys" },
  { href: "/parametres/webhooks", label: "Webhooks", action: "webhooks:create", icon: "webhooks" },
  {
    href: "/documentation",
    label: "Documentation",
    action: "dashboard:view",
    icon: "documentation",
  },
  {
    href: "/organisations",
    label: "Organisations",
    action: "organizations:list",
    icon: "organisations",
  },
  { href: "/utilisateurs", label: "Utilisateurs", action: "users:list", icon: "utilisateurs" },
  { href: "/invitations", label: "Invitations", action: "invitations:list", icon: "invitations" },
  {
    href: "/configuration",
    label: "Configuration",
    action: "organizations:list",
    icon: "configuration",
  },
];

/** Liens toujours visibles dans la barre. */
const PRIMARY_HREFS = new Set(["/dashboard", "/prospects", "/liens", "/conversations", "/leads"]);

/** Entrées déplacées dans le menu du profil (pas de doublon dans la boîte à outils). */
const ACCOUNT_HREFS = new Set([
  "/organisations",
  "/utilisateurs",
  "/invitations",
  "/parametres/api-keys",
]);

/**
 * En-tête : navigation primaire fixe + boîte à outils responsive (tous les
 * modules) à droite du profil. Le menu n'est plus un débordement textuel.
 */
export function DashboardHeader({
  role,
  email,
  organizations,
  activeOrganizationId,
  organizationName,
  isSuperAdmin,
}: {
  role: Role;
  email: string;
  organizations: { id: string; name: string }[];
  activeOrganizationId: string | null;
  organizationName: string | null;
  isSuperAdmin: boolean;
}) {
  // Le super-admin voit tout (son rôle effectif peut être `admin` sans ces actions).
  const pathname = usePathname();
  const links = ITEMS.filter((item) => isSuperAdmin || can(role, item.action));
  const primaryLinks = links.filter((item) => PRIMARY_HREFS.has(item.href));
  const toolboxLinks = links.filter((item) => !ACCOUNT_HREFS.has(item.href));
  const isActive = (href: string): boolean =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="bar">
      <div className="wrap bar-inner">
        <Link
          href="/dashboard"
          className="brand brand-logo"
          aria-label="ONIR CMS — tableau de bord"
        >
          <BrandLogo priority />
        </Link>

        <nav aria-label="Navigation principale" className="dash-nav">
          {primaryLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="tools">
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
          <NotificationBell organizationId={activeOrganizationId} />
          <ThemeToggle />

          {/* Boîte à outils : tous les modules accessibles, à gauche du profil. */}
          <div className="dash-toolbox">
            <button
              type="button"
              className="navtoggle dash-toolbox-toggle"
              aria-expanded={open}
              aria-controls="dash-toolbox"
              aria-label={open ? "Fermer les outils" : "Ouvrir les outils"}
              onClick={() => setOpen((value) => !value)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>

            {open ? (
              <>
                <button
                  type="button"
                  className="dash-toolbox-backdrop"
                  aria-label="Fermer les outils"
                  onClick={() => setOpen(false)}
                />
                <div
                  id="dash-toolbox"
                  className="dash-toolbox-panel"
                  role="dialog"
                  aria-label="Outils de navigation"
                >
                  <div className="dash-toolbox-head">
                    <strong>Outils</strong>
                    <span className="muted-text">{toolboxLinks.length} options</span>
                  </div>
                  <nav className="dash-toolbox-grid" aria-label="Navigation">
                    {toolboxLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="dash-toolbox-link"
                        aria-current={isActive(item.href) ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        <span className="dash-toolbox-icon">
                          <NavIcon name={item.icon} />
                        </span>
                        <span className="dash-toolbox-label">{item.label}</span>
                      </Link>
                    ))}
                  </nav>
                </div>
              </>
            ) : null}
          </div>

          <AccountMenu
            email={email}
            organizationName={organizationName}
            role={role}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </div>
    </header>
  );
}
