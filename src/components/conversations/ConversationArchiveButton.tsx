"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/ToastProvider";

/** Archive / désarchive une conversation depuis le détail. */
export function ConversationArchiveButton({
  conversationId,
  archivee,
}: {
  conversationId: string;
  archivee: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const toggle = async (): Promise<void> => {
    const next = !archivee;
    if (
      next &&
      !(await confirmDialog(
        "Archiver cette conversation ? Elle sera masquée par défaut (filtre « Archivées »).",
      ))
    ) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivee: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(json.error ?? "Action impossible");
        return;
      }
      toast.success(next ? "Conversation archivée." : "Conversation désarchivée.");
      router.refresh();
    } catch {
      toast.error("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className="btn ghost small"
      disabled={pending}
      onClick={() => void toggle()}
    >
      {pending ? "…" : archivee ? "Désarchiver" : "Archiver"}
    </button>
  );
}
