/**
 * Pièces jointes de prospection (ADR-0034).
 * Un fichier est fourni pour un champ `file` du modèle de raisonnement, stocké
 * hors base et référencé ensuite dans la fiche. Aucun OCR / aucune IA en v1.
 */

export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type AttachmentMime = (typeof ATTACHMENT_MIME_TYPES)[number];

export const ATTACHMENT_IMAGE_MIMES: readonly AttachmentMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const ATTACHMENT_DOCUMENT_MIMES: readonly AttachmentMime[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const ATTACHMENT_PRESETS = ["image", "document", "all"] as const;

export type AttachmentPreset = (typeof ATTACHMENT_PRESETS)[number];

export const ATTACHMENT_PRESET_LABELS: Record<AttachmentPreset, string> = {
  image: "Images (JPG, PNG, WebP)",
  document: "Documents (PDF, Word, texte)",
  all: "Images et documents",
};

export const DEFAULT_ATTACHMENT_ACCEPT: AttachmentMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export type FileFieldConstraints = {
  accept: AttachmentMime[];
  /** Nombre maximal de fichiers pour ce champ (1..5). */
  maxFiles: number;
  /** Taille maximale par fichier, en octets (1..10 Mio). */
  maxBytes: number;
};

export const DEFAULT_FILE_CONSTRAINTS: FileFieldConstraints = {
  accept: DEFAULT_ATTACHMENT_ACCEPT,
  maxFiles: 1,
  maxBytes: ATTACHMENT_MAX_BYTES,
};

export function isAttachmentMime(value: string): value is AttachmentMime {
  return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function presetAccept(preset: AttachmentPreset): AttachmentMime[] {
  switch (preset) {
    case "image":
      return [...ATTACHMENT_IMAGE_MIMES];
    case "document":
      return [...ATTACHMENT_DOCUMENT_MIMES];
    case "all":
      return [...ATTACHMENT_MIME_TYPES];
  }
}

export function presetOfAccept(accept: readonly string[]): AttachmentPreset {
  const sorted = [...new Set(accept)].sort().join(",");
  for (const preset of ATTACHMENT_PRESETS) {
    if ([...presetAccept(preset)].sort().join(",") === sorted) return preset;
  }
  return "all";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type FileConstraintsValidation =
  | { ok: true; value: FileFieldConstraints }
  | { ok: false; error: string };

/** Valide/normalise les contraintes d'un champ `file` (données JSON du modèle). */
export function normalizeFileConstraints(input: unknown): FileConstraintsValidation {
  const source = isRecord(input) ? input : {};
  const acceptRaw = Array.isArray(source.accept) ? source.accept : [];
  const accept: AttachmentMime[] = [];
  const seen = new Set<string>();
  for (const entry of acceptRaw) {
    if (typeof entry !== "string" || !isAttachmentMime(entry)) {
      return { ok: false, error: "Type MIME de fichier non pris en charge" };
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    accept.push(entry);
  }
  if (accept.length === 0) {
    return { ok: false, error: "Au moins un format de fichier est requis" };
  }

  const maxFiles =
    typeof source.maxFiles === "number" && Number.isInteger(source.maxFiles) ? source.maxFiles : 1;
  if (maxFiles < 1 || maxFiles > ATTACHMENT_MAX_FILES) {
    return { ok: false, error: `Nombre de fichiers entre 1 et ${ATTACHMENT_MAX_FILES}` };
  }

  const maxBytes =
    typeof source.maxBytes === "number" && Number.isInteger(source.maxBytes)
      ? source.maxBytes
      : ATTACHMENT_MAX_BYTES;
  if (maxBytes < 1 || maxBytes > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: `Taille maximale par fichier entre 1 octet et ${ATTACHMENT_MAX_BYTES}`,
    };
  }

  return { ok: true, value: { accept, maxFiles, maxBytes } };
}

export function fileFieldAccepts(
  constraints: Pick<FileFieldConstraints, "accept">,
  mime: string,
): boolean {
  return constraints.accept.includes(mime as AttachmentMime);
}

/** Nombre maximal de fichiers total pour un champ (borné). */
export function clampMaxFiles(value: number): number {
  return Math.max(1, Math.min(value, ATTACHMENT_MAX_FILES));
}

export type Attachment = {
  id: string;
  organizationId: string;
  conversationId: string;
  messageId: string | null;
  fieldName: string;
  fieldLabel: string;
  originalName: string;
  mime: AttachmentMime;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  createdAt: string;
};

export type CreateAttachmentInput = {
  conversationId: string;
  messageId: string | null;
  fieldName: string;
  fieldLabel: string;
  originalName: string;
  mime: AttachmentMime;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
};

export type FicheAttachment = Attachment & {
  ficheId: string;
};

/** Nettoie un nom de fichier affichable (jamais utilisé comme chemin). */
export function sanitizeOriginalName(value: string): string {
  const raw = value.replace(/\\/g, "/").split("/").pop();
  const base =
    raw === undefined
      ? undefined
      : Array.from(raw)
          .filter((character) => {
            const code = character.codePointAt(0) ?? 0;
            return code >= 0x20 && code !== 0x7f;
          })
          .join("")
          .replace(/\s+/g, " ")
          .trim();
  if (base === undefined || base === "") return "fichier";
  return base.slice(0, 180);
}

/** Extension de stockage déduite du MIME détecté. */
export function attachmentExtension(mime: AttachmentMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "text/plain":
      return "txt";
  }
}

export function isImageAttachment(mime: AttachmentMime): boolean {
  return (ATTACHMENT_IMAGE_MIMES as readonly string[]).includes(mime);
}

/** Vue sérialisable d'une pièce (jamais de clé de stockage ni de hash). */
export type AttachmentView = {
  id: string;
  conversationId: string;
  messageId: string | null;
  fieldName: string;
  fieldLabel: string;
  originalName: string;
  mime: AttachmentMime;
  sizeBytes: number;
  createdAt: string;
};

export function toAttachmentView(attachment: Attachment): AttachmentView {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId: attachment.messageId,
    fieldName: attachment.fieldName,
    fieldLabel: attachment.fieldLabel,
    originalName: attachment.originalName,
    mime: attachment.mime,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}
