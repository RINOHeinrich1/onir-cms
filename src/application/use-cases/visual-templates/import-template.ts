import { type Actor, assertSuperAdmin } from "@/application/actor";
import { ConflictError, ValidationError } from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { TemplateArchiveReader, TemplateHasher } from "@/application/ports/template-archive";
import type {
  VisualTemplate,
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import { mimeByExtension, validateTemplateManifest } from "@/domain/entities/visual-template";

const MANIFEST_FILE = "onirtech.template.json";

export type ImportVisualTemplateDependencies = {
  templates: VisualTemplateRepository;
  storage: MediaStorage;
  archive: TemplateArchiveReader;
  hasher: TemplateHasher;
};

export type ImportedVisualTemplate = {
  template: VisualTemplate;
  version: VisualTemplateVersion;
};

/**
 * US-TEMPLATE-001 — import d'un template visuel (bundle `.onirtech-template`).
 * Étapes : extraction sûre de l'archive → validation du manifeste → vérification
 * de l'intégrité SRI de l'entrée → enregistrement (versions **immuables**) et
 * stockage des assets via `MediaStorage`.
 */
export async function importVisualTemplate(
  deps: ImportVisualTemplateDependencies,
  actor: Actor,
  input: { data: Buffer },
): Promise<ImportedVisualTemplate> {
  assertSuperAdmin(actor);
  if (input.data.byteLength === 0) {
    throw new ValidationError("Archive vide");
  }

  const files = await deps.archive.extract(input.data);

  const manifestBytes = files.get(MANIFEST_FILE);
  if (manifestBytes === undefined) {
    throw new ValidationError(`Manifeste manquant (${MANIFEST_FILE})`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new ValidationError("Manifeste JSON invalide");
  }

  const validated = validateTemplateManifest(raw);
  if (!validated.ok) {
    throw new ValidationError(
      validated.errors.map((error) => `${error.field} : ${error.message}`).join(" ; "),
    );
  }
  const manifest = validated.value;

  const entryBytes = files.get(manifest.ui.entry);
  if (entryBytes === undefined) {
    throw new ValidationError(`Entrée introuvable dans l'archive : ${manifest.ui.entry}`);
  }
  const entrySri = `sha256-${deps.hasher.sha256Base64(entryBytes)}`;
  if (entrySri !== manifest.ui.integrity) {
    throw new ValidationError(
      "Intégrité SRI de l'entrée invalide (ui.integrity ne correspond pas au fichier)",
    );
  }

  const widget = manifest.ui.widget;
  if (widget !== undefined) {
    const widgetBytes = files.get(widget.entry);
    if (widgetBytes === undefined) {
      throw new ValidationError(`Entrée widget introuvable dans l'archive : ${widget.entry}`);
    }
    const widgetSri = `sha256-${deps.hasher.sha256Base64(widgetBytes)}`;
    if (widgetSri !== widget.integrity) {
      throw new ValidationError("Intégrité SRI de l'entrée widget invalide (ui.widget.integrity)");
    }
  }

  const existing = await deps.templates.findByKey(manifest.id);
  const template =
    existing ??
    (await deps.templates.createTemplate({
      key: manifest.id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.publisher.id,
      createdBy: actor.id,
    }));

  const already = await deps.templates.findVersion(template.id, manifest.version);
  if (already !== null) {
    throw new ConflictError(`Version déjà installée : ${manifest.id}@${manifest.version}`);
  }

  const version = await deps.templates.createVersion({
    templateId: template.id,
    version: manifest.version,
    hostProtocol: manifest.compatibility.hostProtocol,
    trustLevel: manifest.publisher.trustLevel,
    mode: manifest.ui.mode,
    manifest,
    entry: manifest.ui.entry,
    integrity: manifest.ui.integrity,
    createdBy: actor.id,
  });

  for (const [path, bytes] of files) {
    const mime = mimeByExtension(path);
    const storageKey = await deps.storage.save({ data: bytes, contentType: mime });
    await deps.templates.addAsset({
      versionId: version.id,
      path,
      storageKey,
      sha256: deps.hasher.sha256Hex(bytes),
      size: bytes.byteLength,
      mime,
    });
  }

  // ADR-0025 §6/H3 : tout nouveau template est assigné à toutes les organisations.
  await deps.templates.assignToAllOrganizations(template.id);

  return { template, version };
}
