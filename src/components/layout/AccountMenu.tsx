"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { ROLE_LABELS, type Role } from "@/domain/entities/user";
import { type Action, can } from "@/domain/rbac";
import { LogoutButton } from "./LogoutButton";

type SettingsItem = {
  href: string;
  label: string;
  action?: Action;
  icon: ReactNode;
};

const SETTINGS_ITEMS: readonly SettingsItem[] = [
  {
    href: "/parametres-compte",
    label: "Paramètres du compte",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
        <path d="M19 3l1 1M4 3L3 4" />
      </>
    ),
  },
  {
    href: "/parametres/ia",
    label: "Paramètres IA",
    action: "ai:list",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
      </>
    ),
  },
  {
    href: "/configuration",
    label: "Configuration",
    action: "organizations:update",
    icon: (
      <>
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
        <path d="M1 14h6M9 8h6M17 16h6" />
      </>
    ),
  },
];

/**
 * Compte connecté : identité, raccourcis de paramètres autorisés, déconnexion.
 * Les raccourcis sont volontairement regroupés ici et retirés de la boîte à outils.
 */
export function AccountMenu({
  email,
  organizationName,
  role,
  isSuperAdmin,
}: {
  email: string;
  organizationName: string | null;
  role: Role;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initials = email.trim().slice(0, 2).toUpperCase() || "?";
  const settings = SETTINGS_ITEMS.filter(
    (item) =>
      item.action === undefined || isSuperAdmin || (role !== null && can(role, item.action)),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="account">
      <button
        type="button"
        className="avatar"
        aria-expanded={open}
        aria-controls="account-panel"
        aria-label={open ? "Fermer le compte" : `Compte ${email}`}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="account-backdrop"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div id="account-panel" className="account-panel" role="dialog" aria-label="Mon compte">
            <div className="account-identity">
              <p className="account-email">{email}</p>
              <p className="muted-text">
                {organizationName ?? "Aucune organisation"} ·{" "}
                <span className="badge">{isSuperAdmin ? "super-admin" : ROLE_LABELS[role]}</span>
              </p>
            </div>

            {settings.length > 0 ? (
              <div className="account-section">
                <p className="account-section-label">Paramètres</p>
                <nav className="account-links" aria-label="Paramètres">
                  {settings.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="account-link"
                      onClick={() => setOpen(false)}
                    >
                      <span className="account-link-icon">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          {item.icon}
                        </svg>
                      </span>
                      <span>{item.label}</span>
                      <span className="account-link-chevron" aria-hidden>
                        ›
                      </span>
                    </Link>
                  ))}
                </nav>
              </div>
            ) : null}

            <div className="account-footer">
              <LogoutButton />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
