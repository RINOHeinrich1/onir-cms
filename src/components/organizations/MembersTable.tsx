"use client";

import { useState } from "react";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ROLES, type Role } from "@/domain/entities/user";

/** Membres d'une organisation : ajout, changement de rôle, retrait. */
export function MembersTable({
  organizationId,
  initialMembers,
}: {
  organizationId: string;
  initialMembers: MemberDto[];
}) {
  const [members, setMembers] = useState<MemberDto[]>(initialMembers);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("lecteur");
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);

  const refresh = async (): Promise<void> => {
    const response = await fetch(`/api/organizations/${organizationId}/members`, {
      cache: "no-store",
    });
    if (response.ok) {
      const json = (await response.json()) as { members: MemberDto[] };
      setMembers(json.members);
    }
  };

  const add = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password === "" ? { email, role } : { email, password, role }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Ajout impossible");
        return;
      }
      setEmail("");
      setPassword("");
      setCreating(false);
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const changeRole = async (userId: string, next: Role): Promise<void> => {
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Changement impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const remove = async (member: MemberDto): Promise<void> => {
    if (!window.confirm(`Retirer ${member.email} de cette organisation ?`)) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${member.userId}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Retrait impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Rôle</th>
              <th>Compte</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId}>
                <td>{member.email}</td>
                <td>
                  <select
                    value={member.role}
                    onChange={(event) => void changeRole(member.userId, event.target.value as Role)}
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${member.actif ? "" : "muted"}`}>
                    {member.isSuperAdmin ? "super-admin" : member.actif ? "actif" : "inactif"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn danger ghost small"
                    onClick={() => void remove(member)}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 ? (
              <tr>
                <td colSpan={4}>Aucun membre.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="tools" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn small" onClick={() => setCreating(true)}>
          Rattacher / créer un utilisateur
        </button>
      </div>

      {creating ? (
        <Modal title="Rattacher / créer un utilisateur" onClose={() => setCreating(false)}>
          {error !== null ? <p className="alert error">{error}</p> : null}
          <div className="grid-2">
            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              Mot de passe (vide = utilisateur existant)
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
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
          <button type="button" className="btn small" disabled={pending} onClick={() => void add()}>
            {pending ? "Enregistrement…" : "Rattacher"}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
