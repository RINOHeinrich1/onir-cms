"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { ROLE_LABELS, type Role } from "@/domain/entities/user";
import { type Action, can } from "@/domain/rbac";
import { LogoutButton } from "./LogoutButton";

type SettingsItem = {
  href: string;
  label: string;
  action: Action;
  icon: ReactNode;
};

const SETTINGS_ITEMS: readonly SettingsItem[] = [
  {
    href: "/organisations",
    label: "Organisation",
    action: "organizations:list",
    icon: (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </>
    ),
  },
  {
    href: "/utilisateurs",
    label: "Utilisateurs",
    action: "users:list",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    href: "/invitations",
    label: "Invitations",
    action: "invitations:list",
    icon: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 7l-10 6L2 7" />
      </>
    ),
  },
  {
    href: "/parametres/api-keys",
    label: "Clés API",
    action: "api_keys:list",
    icon: (
      <>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="M21 2l-9.6 9.6M15.5 7.5l3 3" />
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
  const settings = SETTINGS_ITEMS.filter((item) => isSuperAdmin || can(role, item.action));

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
