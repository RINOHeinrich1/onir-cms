import type { TemplateAiSkillRef, TemplateAiSkillV1 } from "@/domain/template-skill";

export type LoadedTemplateSkill = {
  ref: TemplateAiSkillRef;
  skill: TemplateAiSkillV1;
};

export interface TemplateSkillLoader {
  load(templateId: string, version: string): Promise<LoadedTemplateSkill[]>;
}
