"use client";

import { useCallback, useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

type Profile = { id: string; name: string; description: string; active: boolean };

export function OrganizationLimitProfilePanel({
  organizationId,
  organizationName,
  initialProfileId,
}: {
  organizationId: string;
  organizationName: string;
  initialProfileId: string | null;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState(initialProfileId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const response = await fetch("/api/platform/limit-profiles", { cache: "no-store" });
      const json = (await response.json()) as { profiles?: Profile[]; error?: string };
      if (!response.ok) {
        setError(json.error ?? "Profils indisponibles");
        return;
      }
      setProfiles(json.profiles ?? []);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (): Promise<void> => {
    if (profileId === "") return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/limit-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Assignation impossible");
        return;
      }
      await load();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <section style={{ marginTop: "2rem" }}>
      <h3>Profil de limites — {organizationName}</h3>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <p className="hint">
        Le profil pilote les limites et les accès IA. Une modification du profil est appliquée
        immédiatement à cette organisation.
      </p>
      <div className="field-row">
        <label className="field">
          Profil assigné
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">— Aucun profil —</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.active ? "" : " (inactif)"}
              </option>
            ))}
          </select>
        </label>
        <div className="tools">
          <button
            type="button"
            className="btn small"
            disabled={pending || profileId === ""}
            onClick={() => void assign()}
          >
            {pending ? "Application…" : "Assigner / réappliquer"}
          </button>
        </div>
      </div>
    </section>
  );
}
