"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FloatingMenu } from "@/components/ui/FloatingMenu";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { OPEN_CONVERSATION_INFO_EVENT } from "./ConversationInfoPanel";

/** Menu vertical des actions d'une conversation ouverte. */
export function ConversationActionsMenu({
  conversationId,
  prospectHref,
  archivee,
  canWrite,
  canGenerateFiche,
  canViewLeads,
}: {
  conversationId: string;
  prospectHref: string | null;
  archivee: boolean;
  canWrite: boolean;
  canGenerateFiche: boolean;
  canViewLeads: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const archive = async (): Promise<void> => {
    const next = !archivee;
    if (
      next &&
      !(await confirmDialog(
        "Archiver cette conversation ? Elle sera masquée par défaut (filtre « Archivées »).",
      ))
    ) {
      return;
    }
    setPending("archive");
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivee: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      toast.success(next ? "Conversation archivée." : "Conversation désarchivée.");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  const generate = async (): Promise<void> => {
    if (
      !(await confirmDialog(
        "Générer la fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      ))
    ) {
      return;
    }
    setPending("generate");
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
      setPending(null);
    }
  };

  return (
    <FloatingMenu
      label="Actions de la conversation"
      panelClassName="conversation-actions-menu-panel"
    >
      {prospectHref !== null ? <Link href={prospectHref}>Voir le prospect</Link> : null}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_CONVERSATION_INFO_EVENT))}
      >
        Informations
      </button>
      {canWrite ? (
        <button type="button" disabled={pending !== null} onClick={() => void archive()}>
          {archivee ? "Désarchiver" : "Archiver"}
        </button>
      ) : null}
      {canGenerateFiche ? (
        <button type="button" disabled={pending !== null} onClick={() => void generate()}>
          {pending === "generate" ? "Génération…" : "Générer la fiche"}
        </button>
      ) : null}
    </FloatingMenu>
  );
}
