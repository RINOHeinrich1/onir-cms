"use client";

import { useCallback, useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

type Profile = { id: string; name: string; description: string; active: boolean };

export function OrganizationLimitProfilePanel({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [initialProfileId, setInitialProfileId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [profilesResponse, limitsResponse] = await Promise.all([
        fetch("/api/platform/limit-profiles", { cache: "no-store" }),
        fetch(`/api/organizations/${organizationId}/limits`, { cache: "no-store" }),
      ]);
      const profilesJson = (await profilesResponse.json()) as {
        profiles?: Profile[];
        error?: string;
      };
      const limitsJson = (await limitsResponse.json()) as {
        limits?: { limitProfileId?: string | null };
        error?: string;
      };
      if (!profilesResponse.ok) {
        setError(profilesJson.error ?? "Profils indisponibles");
        return;
      }
      if (!limitsResponse.ok) {
        setError(limitsJson.error ?? "Organisation indisponible");
        return;
      }
      setProfiles(profilesJson.profiles ?? []);
      const current = limitsJson.limits?.limitProfileId ?? "";
      setProfileId(current);
      setInitialProfileId(current);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }, [organizationId]);

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
      setInitialProfileId(profileId);
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
            disabled={pending || profileId === "" || profileId === initialProfileId}
            onClick={() => void assign()}
          >
            {pending ? "Application…" : "Assigner le profil"}
          </button>
        </div>
      </div>
    </section>
  );
}
