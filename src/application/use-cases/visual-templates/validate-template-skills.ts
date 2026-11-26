import { ValidationError } from "@/application/errors";
import type { TemplateHasher } from "@/application/ports/template-archive";
import type { TemplateManifest } from "@/domain/entities/visual-template";
import {
  TEMPLATE_SKILL_MAX_BYTES,
  TEMPLATE_SKILL_TOTAL_MAX_BYTES,
  validateTemplateAiSkill,
} from "@/domain/template-skill";

export type ValidatedTemplateSkill = {
  refId: string;
  path: string;
  bytes: Buffer;
  content: string;
};

export function validateTemplateSkillsArchive(
  files: Map<string, Buffer>,
  manifest: TemplateManifest,
  hasher: TemplateHasher,
): ValidatedTemplateSkill[] {
  const refs = manifest.aiSkills ?? [];
  if (refs.length === 0) return [];
  const skills: ValidatedTemplateSkill[] = [];
  let total = 0;
  for (const ref of refs) {
    const bytes = files.get(ref.path);
    if (bytes === undefined) {
      throw new ValidationError(`Skill introuvable dans l'archive : ${ref.path}`);
    }
    if (bytes.byteLength > TEMPLATE_SKILL_MAX_BYTES) {
      throw new ValidationError(`Skill trop volumineux : ${ref.path}`);
    }
    total += bytes.byteLength;
    if (total > TEMPLATE_SKILL_TOTAL_MAX_BYTES) {
      throw new ValidationError("Total des skills trop volumineux");
    }
    const actual = `sha256-${hasher.sha256Base64(bytes)}`;
    if (actual !== ref.integrity) {
      throw new ValidationError(`Intégrité SRI invalide pour le skill : ${ref.path}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString("utf8"));
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
      throw new ValidationError(
        `L'id du skill (${validated.value.id}) ne correspond pas au manifeste (${ref.id})`,
      );
    }
    skills.push({ refId: ref.id, path: ref.path, bytes, content: bytes.toString("utf8") });
  }
  return skills;
}
