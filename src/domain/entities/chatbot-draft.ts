/**
 * Extraction des médias photo TEMPORAIRES référencés par un brouillon de
 * chatbot. Un média temporaire est une photo `actif = false` sans portée :
 * il ne doit jamais être supprimé s'il a déjà été finalisé (rattaché à un
 * chatbot) entre-temps.
 */
export function collectTemporaryPhotoMediaIds(state: unknown): string[] {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return [];
  const dataDraft = (state as Record<string, unknown>).dataDraft;
  if (dataDraft === null || typeof dataDraft !== "object" || Array.isArray(dataDraft)) {
    return [];
  }
  const photos = (dataDraft as Record<string, unknown>).photos;
  if (!Array.isArray(photos)) return [];

  const ids: string[] = [];
  for (const photo of photos) {
    if (photo === null || typeof photo !== "object" || Array.isArray(photo)) continue;
    const mediaId = (photo as Record<string, unknown>).mediaId;
    if (typeof mediaId !== "string") continue;
    const id = mediaId.trim();
    if (id !== "" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
