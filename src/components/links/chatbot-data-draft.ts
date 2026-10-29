/**
 * Brouillons de données saisis dans l'étape « Données » du wizard chatbot.
 * Connaissances et liens restent en JSONB dans le brouillon et sont créés à la
 * finalisation (`chatLinkIds: [id]`). Les photos, elles, sont importées
 * immédiatement comme médias temporaires puis finalisées à la création.
 */

export type ConnaissanceDraftInput = { titre: string; contenu: string };
export type ConnaissanceDraft = ConnaissanceDraftInput & { id: string };
export type LienDraftInput = { libelle: string; url: string; description: string };
export type LienDraft = LienDraftInput & { id: string };
export type PhotoDraftInput = { fichier: File | null; libelle: string; description: string };
/**
 * Photo du brouillon. En mode wizard, le fichier est importé immédiatement
 * comme média temporaire (`actif = false`, sans portée) et seul `mediaId` est
 * conservé dans l'état sérialisé. `fichier` reste supporté pour les usages
 * hors wizard (import différé à la création).
 */
export type PhotoDraft = {
  id: string;
  libelle: string;
  description: string;
  fichier?: File;
  mediaId?: string;
};
/** Photo sérialisable : le fichier n'est jamais persisté en JSONB. */
export type PersistedPhotoDraft = {
  id: string;
  libelle: string;
  description: string;
  mediaId: string;
};

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

export type PersistedChatbotDataDraft = {
  connaissances: ConnaissanceDraft[];
  liens: LienDraft[];
  photos: PersistedPhotoDraft[];
};

export const EMPTY_CHATBOT_DATA_DRAFT: ChatbotDataDraft = {
  connaissances: [],
  liens: [],
  photos: [],
};

/** État sérialisable (JSONB) : les `File` ne sont jamais persistés. */
export function serializeChatbotDataDraft(draft: ChatbotDataDraft): PersistedChatbotDataDraft {
  return {
    connaissances: draft.connaissances.map((item) => ({
      id: item.id,
      titre: item.titre,
      contenu: item.contenu,
    })),
    liens: draft.liens.map((item) => ({
      id: item.id,
      libelle: item.libelle,
      url: item.url,
      description: item.description,
    })),
    photos: draft.photos
      .filter((item): item is PhotoDraft & { mediaId: string } => typeof item.mediaId === "string")
      .map((item) => ({
        id: item.id,
        libelle: item.libelle,
        description: item.description,
        mediaId: item.mediaId,
      })),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Recharge un brouillon sérialisé (tolérant aux états partiels/legacy). */
export function hydrateChatbotDataDraft(input: unknown): ChatbotDataDraft {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return EMPTY_CHATBOT_DATA_DRAFT;
  }
  const source = input as Record<string, unknown>;
  const connaissances = Array.isArray(source.connaissances)
    ? source.connaissances.flatMap((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        return [
          {
            id: text(item.id) || nextDraftId(),
            titre: text(item.titre),
            contenu: text(item.contenu),
          },
        ];
      })
    : [];
  const liens = Array.isArray(source.liens)
    ? source.liens.flatMap((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        return [
          {
            id: text(item.id) || nextDraftId(),
            libelle: text(item.libelle),
            url: text(item.url),
            description: text(item.description),
          },
        ];
      })
    : [];
  const photos = Array.isArray(source.photos)
    ? source.photos.flatMap((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
        const item = entry as Record<string, unknown>;
        const mediaId = text(item.mediaId).trim();
        if (mediaId === "") return [];
        return [
          {
            id: text(item.id) || nextDraftId(),
            libelle: text(item.libelle),
            description: text(item.description),
            mediaId,
          },
        ];
      })
    : [];
  return { connaissances, liens, photos };
}

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
  /**
   * Photos temporaires dont la finalisation a échoué : elles ne doivent pas
   * être nettoyées avec le brouillon, pour ne pas perdre le fichier importé.
   */
  failedPhotoMediaIds: string[];
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
  const failedPhotoMediaIds: string[] = [];
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
    const label = photo.libelle.trim();
    try {
      if (photo.mediaId !== undefined) {
        // Photo déjà importée en média temporaire : on la finalise en la
        // rattachant au chatbot et en l'activant. Un retry couvre un incident
        // réseau transitoire ; un échec définitif est signalé explicitement.
        let response: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          response = await fetch(`/api/medias/${photo.mediaId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatLinkIds, actif: true }),
          });
          if (response.ok) break;
        }
        if (response === null || !response.ok) {
          failedPhotoMediaIds.push(photo.mediaId);
          failures.push(
            `Photo « ${label} » : ${await errorMessage(
              response ?? new Response(),
              "finalisation impossible",
            )}`,
          );
          continue;
        }
        created += 1;
        continue;
      }
      if (photo.fichier === undefined) {
        failures.push(`Photo « ${label} » : fichier introuvable`);
        continue;
      }
      const form = new FormData();
      form.set("libelle", label);
      form.set("description", photo.description.trim());
      form.set("actif", "true");
      form.set("fichier", photo.fichier);
      for (const id of chatLinkIds) form.append("chatLinkIds", id);
      const response = await fetch("/api/medias/photo", { method: "POST", body: form });
      if (!response.ok) {
        failures.push(`Photo « ${label} » : ${await errorMessage(response, "import impossible")}`);
        continue;
      }
      created += 1;
    } catch {
      failures.push(`Photo « ${label} » : erreur réseau`);
    }
  }

  return { created, failures, failedPhotoMediaIds };
}

/**
 * Données proposées à la sélection : globales + (édition seulement) celles déjà
 * scopées au chatbot courant. Les données scopées à un autre chatbot ne sont
 * jamais proposées, pour éviter un partage silencieux.
 */
export function selectableDataForChatbot<T extends { chatLinkIds: string[] }>(
  items: T[],
  chatLinkId?: string | null,
): T[] {
  const current = chatLinkId?.trim() ?? "";
  return items.filter(
    (item) =>
      item.chatLinkIds.length === 0 || (current !== "" && item.chatLinkIds.includes(current)),
  );
}
