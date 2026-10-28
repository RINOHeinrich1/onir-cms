"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";

/** Génère la fiche d'une conversation existante (opérateur, US-CONVERS-002). */
export function GenerateFicheButton({
  conversationId,
  canViewLeads,
}: {
  conversationId: string;
  canViewLeads: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  const generate = async (): Promise<void> => {
    if (
      !(await confirmDialog(
        "Générer la fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      ))
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/fiche`, {
        method: "POST",
      });
      const json = (await response.json()) as { fiche?: { id: string }; error?: string };
      if (!response.ok || json.fiche === undefined) {
        setError(json.error ?? "Génération impossible");
        return;
      }
      toast.success("Fiche de prospection générée.");
      if (canViewLeads) {
        router.push(`/leads/${json.fiche.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="tools">
      {error !== null ? <p className="alert error">{error}</p> : null}
      <button
        type="button"
        className="btn small"
        disabled={pending}
        onClick={() => void generate()}
      >
        {pending ? "Génération…" : "Générer la fiche"}
      </button>
    </div>
  );
}
