import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type {
  TemplateParamAsset,
  TemplateParamAssetRepository,
} from "@/application/ports/template-param-asset-repository";
import { detectAttachmentMime } from "@/domain/attachment-inspection";
import type { AttachmentMime } from "@/domain/entities/attachment";

export const TEMPLATE_PARAM_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const TEMPLATE_PARAM_IMAGE_MIME_TYPES: readonly AttachmentMime[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export type TemplateParamAssetDependencies = {
  assets: TemplateParamAssetRepository;
  storage: MediaStorage;
};

export async function createTemplateParamAsset(
  deps: TemplateParamAssetDependencies,
  actor: Actor,
  input: { data: Buffer; contentType: string },
): Promise<{ asset: TemplateParamAsset; url: string }> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  if (input.data.byteLength === 0) throw new ValidationError("Fichier vide");
  if (input.data.byteLength > TEMPLATE_PARAM_IMAGE_MAX_BYTES) {
    throw new ValidationError(
      `Fichier trop volumineux (${Math.round(TEMPLATE_PARAM_IMAGE_MAX_BYTES / 1024 / 1024)} Mo maximum)`,
    );
  }
  const detected = detectAttachmentMime(input.data);
  if (detected === null || !TEMPLATE_PARAM_IMAGE_MIME_TYPES.includes(detected)) {
    throw new ValidationError("Format d'image non pris en charge (PNG, JPEG, WebP)");
  }
  const storageKey = await deps.storage.save({
    data: input.data,
    contentType: detected,
    organizationId,
  });
  try {
    const asset = await deps.assets.create(organizationId, {
      storageKey,
      mime: detected,
      sizeBytes: input.data.byteLength,
      createdBy: actor.id,
    });
    return { asset, url: templateParamAssetUrl(asset.id) };
  } catch (error) {
    await deps.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteTemplateParamAsset(
  deps: TemplateParamAssetDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  const asset = await deps.assets.delete(organizationId, id);
  if (asset === null) throw new NotFoundError("Asset image introuvable");
  await deps.storage.remove(asset.storageKey);
}

export function templateParamAssetUrl(id: string): string {
  return `/api/template-param-assets/${id}`;
}
