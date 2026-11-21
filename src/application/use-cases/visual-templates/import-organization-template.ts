import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  ConflictError,
  TemplateKeyReservedError,
  TemplateLimitReachedError,
  ValidationError,
} from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { TemplateArchiveReader, TemplateHasher } from "@/application/ports/template-archive";
import type { VisualTemplateAuditRepository } from "@/application/ports/visual-template-audit-repository";
import type {
  VisualTemplate,
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import { mimeByExtension, validateTemplateManifest } from "@/domain/entities/visual-template";
import { isReservedTemplateKey, MAX_OWNER_TEMPLATES } from "@/domain/template-keys";

const MANIFEST_FILE = "onirtech.template.json";
export type ImportOrganizationVisualTemplateDependencies = {
  templates: VisualTemplateRepository;
  storage: MediaStorage;
  archive: TemplateArchiveReader;
  hasher: TemplateHasher;
  audit?: VisualTemplateAuditRepository;
};

export type ImportedOrganizationVisualTemplate = {
  template: VisualTemplate;
  version: VisualTemplateVersion;
};

/**
 * ADR-0091 §3 — import d'un template privé par l'admin d'organisation.
 * Le transport est forcé en iframe community ; le template est auto-installé
 * dans l'organisation propriétaire, jamais dans les autres.
 */
export async function importOrganizationVisualTemplate(
  deps: ImportOrganizationVisualTemplateDependencies,
  actor: Actor,
  input: { data: Buffer },
): Promise<ImportedOrganizationVisualTemplate> {
  assertCan(actor, "visualtemplates:upload");
  const organizationId = organizationOf(actor);

  if (input.data.byteLength === 0) {
    throw new ValidationError("Archive vide");
  }

  const currentOwned = await deps.templates.countOwnedByOrganization(organizationId);
  if (currentOwned >= MAX_OWNER_TEMPLATES) {
    throw new TemplateLimitReachedError(MAX_OWNER_TEMPLATES);
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

  const validated = validateTemplateManifest(raw, { organizationTemplate: true });
  if (!validated.ok) {
    throw new ValidationError(
      validated.errors.map((error) => `${error.field} : ${error.message}`).join(" ; "),
    );
  }
  const manifest = validated.value;

  if (isReservedTemplateKey(manifest.id)) {
    throw new TemplateKeyReservedError(manifest.id);
  }
  if ((await deps.templates.findPlatformByKey(manifest.id)) !== null) {
    throw new TemplateKeyReservedError(manifest.id);
  }

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

  let template: VisualTemplate | null = null;
  let version: VisualTemplateVersion | null = null;
  let createdTemplate = false;
  const savedStorageKeys: string[] = [];
  try {
    const existing = await deps.templates.findByKeyForOrganization(organizationId, manifest.id);
    const isNewTemplate = existing === null;
    if (existing === null) {
      template = await deps.templates.createTemplate({
        key: manifest.id,
        name: manifest.name,
        description: manifest.description,
        author: manifest.publisher.id,
        ownerOrganizationId: organizationId,
        uploadedBy: actor.id,
        createdBy: actor.id,
      });
      createdTemplate = true;
    } else {
      template = existing;
    }

    if (template.ownerOrganizationId !== organizationId) {
      throw new TemplateKeyReservedError(manifest.id);
    }

    const already = await deps.templates.findVersion(template.id, manifest.version);
    if (already !== null) {
      throw new ConflictError(`Version déjà installée : ${manifest.id}@${manifest.version}`);
    }

    version = await deps.templates.createVersion({
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
      const storageKey = await deps.storage.save({
        data: bytes,
        contentType: mime,
        organizationId,
      });
      savedStorageKeys.push(storageKey);
      await deps.templates.addAsset({
        versionId: version.id,
        path,
        storageKey,
        sha256: deps.hasher.sha256Hex(bytes),
        size: bytes.byteLength,
        mime,
      });
    }

    if (isNewTemplate) {
      await deps.templates.install(organizationId, template.id, actor.id, "organization_upload");
    }

    await deps.audit?.record({
      organizationId,
      templateId: template.id,
      actorId: actor.id,
      event: "upload",
      metadata: {
        version: version.version,
        ownerOrganizationId: organizationId,
        isNewTemplate,
      },
    });

    return { template, version };
  } catch (error) {
    if (template !== null) {
      if (version !== null) {
        await deps.templates.deleteVersion(template.id, version.version).catch(() => undefined);
      }
      if (createdTemplate) {
        await deps.templates.deleteTemplate(template.id).catch(() => undefined);
      }
    }
    for (const key of savedStorageKeys) {
      await deps.storage.remove(key).catch(() => undefined);
    }
    await deps.audit
      ?.record({
        organizationId,
        templateId: template?.id ?? null,
        actorId: actor.id,
        event: "import_failed",
        metadata: {
          key: manifest.id,
          version: manifest.version,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
