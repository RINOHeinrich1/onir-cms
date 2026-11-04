"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";

export function FicheStatusSelect({
  ficheId,
  statuses,
  value,
}: {
  ficheId: string;
  statuses: FicheStatusDefinition[];
  value: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const current = statuses.find((status) => status.key === value) ?? null;

  if (statuses.length === 0) {
    return <span className="badge muted">Non qualifiée</span>;
  }

  const change = async (next: string): Promise<void> => {
    setPending(true);
    try {
      const response = await fetch(`/api/fiches/${ficheId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusKey: next === "" ? null : next }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        toast.error(json.error ?? "Statut impossible");
        return;
      }
      toast.success("Statut de qualification mis à jour.");
      router.refresh();
    } catch {
      toast.error("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <label className="field" style={{ minWidth: 180 }}>
      Statut de qualification
      <select
        value={current?.key ?? ""}
        disabled={pending}
        onChange={(event) => void change(event.target.value)}
      >
        <option value="">Non qualifiée</option>
        {statuses
          .filter((status) => status.archivedAt === null || status.key === value)
          .map((status) => (
            <option key={status.key} value={status.key}>
              {status.label}
            </option>
          ))}
      </select>
    </label>
  );
}
