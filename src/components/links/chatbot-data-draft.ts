/**
 * Brouillons de données saisis dans l'étape « Données » du wizard chatbot.
 * Ils ne sont persistés qu'après la création du chatbot, pour rattacher les
 * ajouts au chatbot fraîchement créé (`chatLinkIds: [id]`).
 */

export type ConnaissanceDraftInput = { titre: string; contenu: string };
export type ConnaissanceDraft = ConnaissanceDraftInput & { id: string };
export type LienDraftInput = { libelle: string; url: string; description: string };
export type LienDraft = LienDraftInput & { id: string };
export type PhotoDraftInput = { fichier: File; libelle: string; description: string };
export type PhotoDraft = PhotoDraftInput & { id: string };

let draftSequence = 0;

/** Identifiant local stable (clé React), jamais persisté. */
export function nextDraftId(): string {
  draftSequence += 1;
  return `draft-${Date.now()}-${draftSequence}`;
}

export type ChatbotDataDraft = {
  connaissances: ConnaissanceDraft[];
  liens: LienDraft[];
  photos: PhotoDraft[];
};

export const EMPTY_CHATBOT_DATA_DRAFT: ChatbotDataDraft = {
  connaissances: [],
  liens: [],
  photos: [],
};

export function chatbotDataDraftCount(draft: ChatbotDataDraft): number {
  return draft.connaissances.length + draft.liens.length + draft.photos.length;
}

/** Validation minimale d'une connaissance brouillon. */
export function validateConnaissanceDraft(input: ConnaissanceDraftInput): string | null {
  if (input.titre.trim() === "") return "Le titre de la connaissance est obligatoire.";
  if (input.titre.trim().length > 120) return "Titre trop long (120 caractères maximum).";
  if (input.contenu.trim() === "") return "Le contenu de la connaissance est obligatoire.";
  return null;
}

/** Validation minimale d'un lien média brouillon. */
export function validateLienDraft(input: LienDraftInput): string | null {
  if (input.libelle.trim() === "") return "Le libellé du lien est obligatoire.";
  if (input.libelle.trim().length > 120) return "Libellé trop long (120 caractères maximum).";
  const url = input.url.trim();
  if (url === "") return "L'URL du lien est obligatoire.";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "L'URL doit commencer par http:// ou https://.";
    }
  } catch {
    return "URL invalide.";
  }
  return null;
}

/** Validation minimale d'une photo brouillon. */
export function validatePhotoDraft(input: PhotoDraftInput): string | null {
  if (input.fichier === null || input.fichier.size === 0) return "Choisissez un fichier image.";
  if (input.libelle.trim() === "") return "Le libellé de la photo est obligatoire.";
  if (input.libelle.trim().length > 120) return "Libellé trop long (120 caractères maximum).";
  return null;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export type SubmitChatbotDataResult = {
  created: number;
  failures: string[];
};

/**
 * Persiste les brouillons en les rattachant au chatbot créé.
 * Un échec n'interrompt pas les autres ajouts : les erreurs sont accumulées
 * pour être signalées sans perdre le chatbot déjà créé.
 */
export async function submitChatbotDataDraft(
  draft: ChatbotDataDraft,
  chatLinkId: string,
): Promise<SubmitChatbotDataResult> {
  const failures: string[] = [];
  let created = 0;
  const chatLinkIds = [chatLinkId];

  for (const connaissance of draft.connaissances) {
    try {
      const response = await fetch("/api/connaissances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: connaissance.titre.trim(),
          contenu: connaissance.contenu.trim(),
          chatLinkIds,
          actif: true,
        }),
      });
      if (!response.ok) {
        failures.push(
          `Connaissance « ${connaissance.titre.trim()} » : ${await errorMessage(
            response,
            "création impossible",
          )}`,
        );
        continue;
      }
      created += 1;
    } catch {
      failures.push(`Connaissance « ${connaissance.titre.trim()} » : erreur réseau`);
    }
  }

  for (const lien of draft.liens) {
    try {
      const response = await fetch("/api/medias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libelle: lien.libelle.trim(),
          description: lien.description.trim(),
          url: lien.url.trim(),
          chatLinkIds,
          actif: true,
        }),
      });
      if (!response.ok) {
        failures.push(
          `Lien « ${lien.libelle.trim()} » : ${await errorMessage(response, "création impossible")}`,
        );
        continue;
      }
      created += 1;
    } catch {
      failures.push(`Lien « ${lien.libelle.trim()} » : erreur réseau`);
    }
  }

  for (const photo of draft.photos) {
    try {
      const form = new FormData();
      form.set("libelle", photo.libelle.trim());
      form.set("description", photo.description.trim());
      form.set("actif", "true");
      form.set("fichier", photo.fichier);
      for (const id of chatLinkIds) form.append("chatLinkIds", id);
      const response = await fetch("/api/medias/photo", { method: "POST", body: form });
      if (!response.ok) {
        failures.push(
          `Photo « ${photo.libelle.trim()} » : ${await errorMessage(
            response,
            "import impossible",
          )}`,
        );
        continue;
      }
      created += 1;
    } catch {
      failures.push(`Photo « ${photo.libelle.trim()} » : erreur réseau`);
    }
  }

  return { created, failures };
}
