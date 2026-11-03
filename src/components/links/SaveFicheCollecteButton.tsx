"use client";

import { useState } from "react";
import type { FicheCollecteDto } from "@/components/fiches-collecte/types";
import { useToast } from "@/components/ui/ToastProvider";
import type { TemplateField } from "@/domain/entities/chat-template";
import { ficheKeyFromLabel } from "@/domain/entities/fiche-collecte";
import type { FicheDraft } from "./chatbot-config-draft";

function fieldNameFromLabel(label: string): string {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized === "" ? "champ" : normalized;
}

function toTemplateFields(fiche: FicheDraft): TemplateField[] {
  return fiche.fields
    .filter((field) => field.label.trim() !== "")
    .map((field) => {
      const options = field.options
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
      return {
        name: field.name.trim() === "" ? fieldNameFromLabel(field.label) : field.name.trim(),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        ...(options.length === 0 ? {} : { options }),
        ...(field.example.trim() === "" ? {} : { example: field.example.trim() }),
        ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
        ...(field.file === undefined ? {} : { file: field.file }),
      };
    });
}

/** Copie une fiche de chatbot vers la bibliothèque réutilisable, sans la retirer du chatbot. */
export function SaveFicheCollecteButton({
  fiche,
  onSaved,
}: {
  fiche: FicheDraft;
  onSaved: (saved: FicheCollecteDto) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (fiche.sourceFicheId !== undefined && fiche.sourceFicheId !== "") return null;

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch("/api/fiches-collecte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: fiche.key.trim() === "" ? ficheKeyFromLabel(fiche.label) : fiche.key,
          label: fiche.label,
          description: fiche.description,
          intent: fiche.intent,
          instructions: fiche.instructions,
          renderTemplate: fiche.renderTemplate,
          fields: toTemplateFields(fiche),
        }),
      });
      const json = (await response.json()) as { fiche?: FicheCollecteDto; error?: string };
      if (!response.ok || json.fiche === undefined) {
        throw new Error(json.error ?? "Enregistrement impossible");
      }
      onSaved(json.fiche);
      toast.success("Fiche enregistrée dans la bibliothèque réutilisable.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className="btn ghost small"
      disabled={saving || fiche.label.trim() === ""}
      onClick={() => void save()}
    >
      {saving ? "Enregistrement…" : "Enregistrer comme fiche réutilisable"}
    </button>
  );
}
