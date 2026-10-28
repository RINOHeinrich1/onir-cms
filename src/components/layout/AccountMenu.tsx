"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, type Role } from "@/domain/entities/user";
import { LogoutButton } from "./LogoutButton";

/**
 * Compte connecté : avatar avec les 2 premières lettres de l'email.
 * Au clic : panneau avec l'email complet + bouton de déconnexion.
 * La déconnexion n'encombre plus la barre (ni le menu de débordement).
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
          <div id="account-panel" className="account-panel" role="dialog" aria-label="Compte">
            <p className="account-email">{email}</p>
            <p className="muted-text">
              {organizationName ?? "Aucune organisation"} ·{" "}
              <span className="badge">{isSuperAdmin ? "super-admin" : ROLE_LABELS[role]}</span>
            </p>
            <LogoutButton />
          </div>
        </>
      ) : null}
    </div>
  );
}
