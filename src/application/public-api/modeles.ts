import { NotFoundError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import { templateDto, templateVersionDto } from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";
import type { ChatTemplate } from "@/domain/entities/chat-template";

export type TemplateListCriteria = {
  q: string | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

function matches(template: ChatTemplate, criteria: TemplateListCriteria): boolean {
  if (criteria.q === null) return true;
  const needle = criteria.q.toLowerCase();
  return `${template.key} ${template.label} ${template.description}`.toLowerCase().includes(needle);
}

export async function listTemplatesForApi(
  deps: { templates: ChatTemplateRepository },
  organizationId: string,
  criteria: TemplateListCriteria,
) {
  const templates = await deps.templates.list(organizationId);
  const filtered = templates.filter((template) => matches(template, criteria));
  const page = paginateByCreatedAt(filtered, criteria.limit, criteria.cursor, criteria.sort);
  const data = await Promise.all(
    page.data.map(async (template) => {
      const current = await deps.templates.currentVersion(organizationId, template.key);
      return templateDto(template, current);
    }),
  );
  return { data, pagination: page.pagination };
}

export async function getTemplateForApi(
  deps: { templates: ChatTemplateRepository },
  organizationId: string,
  key: string,
) {
  const template = await deps.templates.findByKey(organizationId, key);
  if (template === null) throw new NotFoundError("Modèle introuvable");
  const current = await deps.templates.currentVersion(organizationId, key);
  const versions = [];
  for (let version = 1; version <= (current?.version ?? 0); version += 1) {
    const found = await deps.templates.findVersion(organizationId, key, version);
    if (found !== null) {
      versions.push({
        version: found.version,
        createdAt: found.createdAt,
        createdBy: found.createdBy,
      });
    }
  }
  return {
    ...templateDto(template, current),
    versions,
  };
}

export async function getTemplateVersionForApi(
  deps: { templates: ChatTemplateRepository },
  organizationId: string,
  key: string,
  version: number,
) {
  const template = await deps.templates.findByKey(organizationId, key);
  if (template === null) throw new NotFoundError("Modèle introuvable");
  const found = await deps.templates.findVersion(organizationId, key, version);
  if (found === null) throw new NotFoundError("Version introuvable");
  return templateVersionDto(found);
}
