"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ROLES, type Role } from "@/domain/entities/user";
import type { UserDto } from "./types";

type UserFormProps = {
  editing: UserDto | null;
  canSetActif: boolean;
  onSaved: () => void;
  onCancel: () => void;
};

/** Formulaire de création / modification d'un utilisateur (US-USERS-001, admin). */
export function UserForm({ editing, canSetActif, onSaved, onCancel }: UserFormProps) {
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<Role>("lecteur");
  const [actif, setActif] = useState(true);

  useEffect(() => {
    setRole(editing?.role ?? "lecteur");
    setActif(editing?.actif ?? true);
    setError(null);
  }, [editing]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    setPending(true);
    setError(null);
    try {
      let response: Response;
      if (editing === null) {
        response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role, actif: true }),
        });
      } else {
        const patch: { role: Role; actif?: boolean; password?: string } = { role };
        if (canSetActif) patch.actif = actif;
        if (password !== "") patch.password = password;
        response = await fetch(`/api/users/${editing.userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      }

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Échec de l'enregistrement");
        return;
      }
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <label className="field">
        Email
        <input
          type="email"
          name="email"
          defaultValue={editing?.email ?? ""}
          disabled={editing !== null}
          required
        />
      </label>

      <label className="field">
        {editing === null ? "Mot de passe" : "Nouveau mot de passe (optionnel)"}
        <input type="password" name="password" autoComplete="new-password" />
        <span className="hint">8 caractères minimum ; rotation forcée à la connexion.</span>
      </label>

      <label className="field">
        Rôle
        <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      {canSetActif ? (
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={actif}
              onChange={(event) => setActif(event.target.checked)}
            />{" "}
            Compte actif (global, super-admin)
          </span>
        </label>
      ) : null}

      <div className="tools">
        <button type="submit" className="btn small" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {editing !== null ? (
          <button type="button" className="btn ghost small" onClick={onCancel}>
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
