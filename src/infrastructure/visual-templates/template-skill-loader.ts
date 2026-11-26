import { ValidationError } from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { TemplateHasher } from "@/application/ports/template-archive";
import type {
  LoadedTemplateSkill,
  TemplateSkillLoader,
} from "@/application/ports/template-skill-loader";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { validateTemplateAiSkill } from "@/domain/template-skill";

const MAX_CACHE_ENTRIES = 50;

export function createTemplateSkillLoader(deps: {
  templates: VisualTemplateRepository;
  storage: MediaStorage;
  hasher: TemplateHasher;
}): TemplateSkillLoader {
  const cache = new Map<string, LoadedTemplateSkill[]>();

  return {
    async load(templateId, version) {
      const key = `${templateId}@${version}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      const templateVersion = await deps.templates.findVersion(templateId, version);
      if (templateVersion === null) {
        throw new ValidationError("Version de template introuvable");
      }
      const refs = templateVersion.manifest.aiSkills ?? [];
      const loaded: LoadedTemplateSkill[] = [];
      for (const ref of refs) {
        const asset = await deps.templates.findAsset(templateVersion.id, ref.path);
        if (asset === null) {
          throw new ValidationError(`Skill introuvable : ${ref.path}`);
        }
        const file = await deps.storage.read(asset.storageKey);
        if (file === null) {
          throw new ValidationError(`Fichier de skill introuvable : ${ref.path}`);
        }
        const actual = `sha256-${deps.hasher.sha256Base64(file.data)}`;
        if (actual !== ref.integrity) {
          throw new ValidationError(`Intégrité du skill invalide : ${ref.path}`);
        }
        let raw: unknown;
        try {
          raw = JSON.parse(file.data.toString("utf8"));
        } catch {
          throw new ValidationError(`Skill JSON invalide : ${ref.path}`);
        }
        const validated = validateTemplateAiSkill(raw);
        if (!validated.ok) {
          throw new ValidationError(
            validated.errors
              .map((error) => `${ref.path}.${error.field} : ${error.message}`)
              .join(" ; "),
          );
        }
        if (validated.value.id !== ref.id) {
          throw new ValidationError(`Id de skill incohérent : ${ref.path}`);
        }
        loaded.push({ ref, skill: validated.value });
      }
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
      }
      cache.set(key, loaded);
      return loaded;
    },
  };
}
