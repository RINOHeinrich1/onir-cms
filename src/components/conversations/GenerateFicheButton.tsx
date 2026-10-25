"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

/** Génère la fiche d'une conversation existante (opérateur, US-CONVERS-002). */
export function GenerateFicheButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const generate = async (): Promise<void> => {
    if (
      !window.confirm(
        "Générer la fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      )
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
      router.push(`/leads/${json.fiche.id}`);
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
