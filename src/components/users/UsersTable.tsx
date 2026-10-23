"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ROLES, type Role } from "@/domain/entities/user";
import type { UserDto } from "./types";
import { UserForm } from "./UserForm";

/** Table des utilisateurs + opérations CRUD (US-USERS-001, admin uniquement). */
export function UsersTable({
  initialUsers,
  canSetActif,
  organizationId,
  canAttachExisting,
}: {
  initialUsers: UserDto[];
  canSetActif: boolean;
  organizationId: string | null;
  canAttachExisting: boolean;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserDto[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachEmail, setAttachEmail] = useState("");
  const [attachRole, setAttachRole] = useState<Role>("lecteur");

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { users: UserDto[] };
        setUsers(json.users);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const onSaved = async (): Promise<void> => {
    setEditing(null);
    setCreating(false);
    await refresh();
  };

  const attach = async (): Promise<void> => {
    if (organizationId === null) return;
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: attachEmail, role: attachRole }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Rattachement impossible");
        return;
      }
      setAttachEmail("");
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const remove = async (user: UserDto): Promise<void> => {
    setError(null);
    if (!window.confirm(`Supprimer ${user.email} ?`)) return;
    try {
      const response = await fetch(`/api/users/${user.userId}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div className="users-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      {canAttachExisting && organizationId !== null ? (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h4>Rattacher un utilisateur existant</h4>
          <div className="grid-2">
            <label className="field">
              Email
              <input
                type="email"
                value={attachEmail}
                onChange={(event) => setAttachEmail(event.target.value)}
              />
            </label>
            <label className="field">
              Rôle
              <select
                value={attachRole}
                onChange={(event) => setAttachRole(event.target.value as Role)}
              >
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn small"
            disabled={attachEmail.trim() === ""}
            onClick={() => void attach()}
          >
            Rattacher
          </button>
        </div>
      ) : null}

      <div className="tools" style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn small" onClick={() => setCreating(true)}>
          Nouvel utilisateur
        </button>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Mot de passe</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td>{user.email}</td>
                <td>
                  <span className="badge">{user.role}</span>
                </td>
                <td>
                  <span className={`badge ${user.actif ? "" : "muted"}`}>
                    {user.actif ? "actif" : "inactif"}
                  </span>
                </td>
                <td>
                  {user.mustChangePassword ? (
                    <span className="badge orange">à changer</span>
                  ) : (
                    <span className="badge muted">à jour</span>
                  )}
                </td>
                <td>
                  <div className="tools">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setEditing(user)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn danger ghost small"
                      onClick={() => void remove(user)}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={5}>Aucun utilisateur.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating || editing !== null ? (
        <Modal
          title={editing === null ? "Nouvel utilisateur" : `Modifier ${editing.email}`}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        >
          <UserForm
            editing={editing}
            canSetActif={canSetActif}
            onSaved={() => void onSaved()}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
