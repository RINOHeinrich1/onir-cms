"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

type OrganizationOption = { id: string; name: string };

/** Sélecteur d'organisation active (ADR-0025 §4) — POST serveur + rafraîchissement. */
export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  if (organizations.length === 0) return null;

  const onChange = async (organizationId: string): Promise<void> => {
    if (organizationId === activeOrganizationId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/switch-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Bascule impossible");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <label className="org-switcher" title={error ?? "Changer d'organisation"}>
      <span className="sr-only">Organisation active</span>
      <select
        value={activeOrganizationId ?? ""}
        disabled={pending}
        onChange={(event) => void onChange(event.target.value)}
      >
        {activeOrganizationId === null ? <option value="">Aucune organisation</option> : null}
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      {error !== null ? <span className="badge orange">{error}</span> : null}
    </label>
  );
}
