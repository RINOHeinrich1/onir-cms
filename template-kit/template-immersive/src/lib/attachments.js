// Pièces jointes du template Immersive (ADR-0034) : helpers purs, sans DOM.
const DEFAULT_MAX_FILES = 1;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Champs `file` du modèle de raisonnement. */
export function fileFields(modelForm) {
  return (Array.isArray(modelForm) ? modelForm : []).filter((field) => field?.type === "file");
}

/** Attribut `accept` du sélecteur natif. */
export function acceptAttribute(field) {
  return Array.isArray(field?.accept) ? field.accept.join(",") : "";
}

export function maxFiles(field) {
  return Number.isInteger(field?.maxFiles) && field.maxFiles > 0 ? field.maxFiles : DEFAULT_MAX_FILES;
}

export function maxBytes(field) {
  return Number.isInteger(field?.maxBytes) && field.maxBytes > 0 ? field.maxBytes : DEFAULT_MAX_BYTES;
}

export function pendingForField(pending, fieldName) {
  return (Array.isArray(pending) ? pending : []).filter((item) => item?.fieldName === fieldName);
}

/** Valide localement avant l'appel hôte (l'hôte reste l'autorité finale). */
export function canAddFiles(field, pending, files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) return { ok: false, error: "Aucun fichier sélectionné" };
  const existing = pendingForField(pending, field?.name).length;
  const limit = maxFiles(field);
  if (existing + list.length > limit) {
    return { ok: false, error: `Maximum ${limit} fichier${limit > 1 ? "s" : ""} pour « ${field?.label ?? "ce champ"} »` };
  }
  const accept = Array.isArray(field?.accept) ? field.accept : [];
  const bytes = maxBytes(field);
  for (const file of list) {
    if (accept.length > 0 && !accept.includes(file.type)) {
      return { ok: false, error: `Format non autorisé : ${file.name}` };
    }
    if (file.size > bytes) {
      return { ok: false, error: `Fichier trop volumineux : ${file.name}` };
    }
  }
  return { ok: true };
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Liens des pièces rattachées à un message (URL signée fournie par l'hôte). */
export function attachmentsHtml(attachments) {
  const items = (Array.isArray(attachments) ? attachments : []).filter(
    (item) => typeof item?.url === "string" && item.url.trim() !== "",
  );
  if (items.length === 0) return "";
  const links = items
    .map(
      (item) =>
        `<a class="attachlink" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="attachname">${escapeHtml(item.originalName || "Pièce jointe")}</span>` +
        `<span class="attachmeta">${escapeHtml(item.fieldLabel || "Pièce jointe")} · ${formatFileSize(item.sizeBytes)}</span>` +
        "</a>",
    )
    .join("");
  return `<div class="attachlinks" aria-label="Pièces jointes">${links}</div>`;
}
