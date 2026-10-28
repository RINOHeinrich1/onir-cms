"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/entities/user";
import type { UserDto } from "./types";
import { UserForm } from "./UserForm";

/** Table des utilisateurs + opérations CRUD (US-USERS-001, admin uniquement). */
export function UsersTable({
  initialUsers,
  canSetActif,
  organizationId,
  canAttachExisting,
  chatLinks,
}: {
  initialUsers: UserDto[];
  canSetActif: boolean;
  organizationId: string | null;
  canAttachExisting: boolean;
  chatLinks: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserDto[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [attachEmail, setAttachEmail] = useState("");
  const [attachRole, setAttachRole] = useState<Role>("lecteur");
  const [scopeUser, setScopeUser] = useState<UserDto | null>(null);
  const [scopeAllLinks, setScopeAllLinks] = useState(true);
  const [scopeLinkIds, setScopeLinkIds] = useState<string[]>([]);
  const [scopePending, setScopePending] = useState(false);

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

  const openScope = (user: UserDto): void => {
    setScopeUser(user);
    setScopeAllLinks(user.chatScope?.allLinks ?? true);
    setScopeLinkIds(user.chatScope?.linkIds ?? []);
  };

  const toggleScopeLink = (linkId: string): void => {
    setScopeLinkIds((current) =>
      current.includes(linkId) ? current.filter((value) => value !== linkId) : [...current, linkId],
    );
  };

  const saveScope = async (): Promise<void> => {
    if (organizationId === null || scopeUser === null) return;
    setScopePending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${scopeUser.userId}/chat-scope`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allLinks: scopeAllLinks, linkIds: scopeLinkIds }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement de la portée impossible");
        return;
      }
      setScopeUser(null);
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setScopePending(false);
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
                    {ROLE_LABELS[value]}
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
              <th>Chatbots</th>
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
                  <span className="badge">{ROLE_LABELS[user.role]}</span>
                </td>
                <td>
                  {user.role === "operateur" ? (
                    <div className="tools">
                      <span
                        className={`badge ${user.chatScope?.allLinks === false ? "orange" : ""}`}
                      >
                        {user.chatScope?.allLinks === false
                          ? `${user.chatScope.linkIds.length} lien(s)`
                          : "Tous"}
                      </span>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => openScope(user)}
                      >
                        Gérer
                      </button>
                    </div>
                  ) : (
                    <span className="muted-text">—</span>
                  )}
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
                <td colSpan={6}>Aucun utilisateur.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {scopeUser !== null ? (
        <Modal
          title={`Chatbots — ${scopeUser.email}`}
          onClose={() => {
            if (!scopePending) setScopeUser(null);
          }}
        >
          <p className="hint" style={{ marginBottom: "1rem" }}>
            Par défaut, l&apos;opérateur voit toutes les conversations de l&apos;organisation.
            Restreignez-le à certains chatbots si nécessaire.
          </p>
          <label className="field">
            <span>
              <input
                type="checkbox"
                checked={scopeAllLinks}
                onChange={(event) => setScopeAllLinks(event.target.checked)}
              />{" "}
              Tous les chatbots de l&apos;organisation
            </span>
          </label>
          {!scopeAllLinks ? (
            <div className="card" style={{ marginTop: "1rem" }}>
              <h4>Chatbots autorisés</h4>
              {chatLinks.length === 0 ? (
                <p className="hint">Aucun chatbot dans cette organisation.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {chatLinks.map((link) => (
                    <label key={link.id} className="field">
                      <span>
                        <input
                          type="checkbox"
                          checked={scopeLinkIds.includes(link.id)}
                          onChange={() => toggleScopeLink(link.id)}
                        />{" "}
                        {link.label.trim() === "" ? "Chatbot sans nom" : link.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="hint">Sans sélection, l&apos;opérateur ne voit aucune conversation.</p>
            </div>
          ) : null}
          <div className="tools" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn small"
              disabled={scopePending}
              onClick={() => void saveScope()}
            >
              {scopePending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={scopePending}
              onClick={() => setScopeUser(null)}
            >
              Annuler
            </button>
          </div>
        </Modal>
      ) : null}

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
