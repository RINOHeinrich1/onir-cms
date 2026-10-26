"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { OrganizationSwitcher } from "@/components/organizations/OrganizationSwitcher";
import type { Role } from "@/domain/entities/user";
import { type Action, can } from "@/domain/rbac";
import { AccountMenu } from "./AccountMenu";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  action: Action;
};

const ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Vue globale", action: "dashboard:view" },
  { href: "/prospects", label: "Prospects", action: "prospects:list" },
  { href: "/liens", label: "Liens de chat", action: "links:list" },
  { href: "/conversations", label: "Conversations", action: "conversations:list" },
  { href: "/leads", label: "Leads", action: "project:read" },
  { href: "/modeles", label: "Modèle de prospection", action: "templates:list" },
  { href: "/connaissances", label: "Connaissances", action: "connaissances:list" },
  { href: "/medias", label: "Médias", action: "medias:list" },
  { href: "/categories", label: "Catégories", action: "categories:list" },
  { href: "/confidentialites", label: "Confidentialité", action: "confidentialites:list" },
  { href: "/templates-visuels", label: "Templates visuels", action: "visualtemplates:list" },
  { href: "/parametres/ia", label: "Paramètres IA", action: "ai:list" },
  { href: "/parametres/api-keys", label: "Clés API", action: "api_keys:list" },
  { href: "/documentation", label: "Documentation", action: "dashboard:view" },
  { href: "/organisations", label: "Organisations", action: "organizations:list" },
  { href: "/utilisateurs", label: "Utilisateurs", action: "users:list" },
  { href: "/invitations", label: "Invitations", action: "invitations:list" },
  { href: "/configuration", label: "Configuration", action: "organizations:list" },
];

/**
 * En-tête à menu « greedy » : la ligne ne s'enroule jamais (`nowrap`) ;
 * seuls les liens qui débordent réellement rejoignent le panneau.
 * Le compte (avatar + déconnexion) reste toujours visible dans la barre.
 * Mesure via `scrollWidth` (+ `ResizeObserver` et chargement des polices),
 * aucun breakpoint : chaque largeur affiche le maximum possible.
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
  const links = ITEMS.filter((item) => isSuperAdmin || can(role, item.action));
  // Nombre d'éléments masqués (liens de la fin vers le début, puis déconnexion).
  const [hiddenCount, setHiddenCount] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const lastWidth = useRef(0);

  const total = links.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mesure impérative du débordement, relancée par nonce
  useLayoutEffect(() => {
    const el = navRef.current;
    if (el === null) return;
    const width = el.clientWidth;
    if (el.scrollWidth > width + 1) {
      if (hiddenCount < total) setHiddenCount(hiddenCount + 1);
      lastWidth.current = width;
    } else if (hiddenCount > 0 && width > lastWidth.current) {
      setHiddenCount(hiddenCount - 1);
      lastWidth.current = width;
    } else {
      lastWidth.current = width;
    }
  }, [hiddenCount, total, nonce]);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => setNonce((value) => value + 1));
    observer.observe(el);
    void document.fonts?.ready.then(() => setNonce((value) => value + 1));
    return () => observer.disconnect();
  }, []);

  const hiddenLinkCount = Math.min(hiddenCount, links.length);
  const visibleLinks = links.slice(0, links.length - hiddenLinkCount);
  const menuLinks = links.slice(links.length - hiddenLinkCount);
  const hasOverflow = hiddenCount > 0;

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

        <nav aria-label="Navigation principale" className="dash-nav" ref={navRef}>
          {visibleLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Hors de la nav (qui est rognée `overflow:hidden`) : sur mobile la nav est
            comprimée à zéro et un bouton placé dedans deviendrait invisible. */}
        {hasOverflow ? (
          <button
            type="button"
            className="navtoggle"
            aria-expanded={open}
            aria-controls="dash-menu"
            aria-label={open ? "Fermer le menu" : "Plus d'options"}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="bars" data-open={open} aria-hidden />
          </button>
        ) : null}

        <div className="tools">
          <OrganizationSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
          />
          <ThemeToggle />
          <AccountMenu
            email={email}
            organizationName={organizationName}
            role={role}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </div>

      {open && hasOverflow ? (
        <div id="dash-menu" className="mobilemenu open">
          <nav aria-label="Navigation">
            {menuLinks.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
