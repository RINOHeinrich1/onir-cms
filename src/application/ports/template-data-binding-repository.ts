import type { TemplateDataBinding } from "@/domain/template-data";

export type EffectiveBindingQuery = {
  organizationId: string;
  templateVersionId: string;
  /** Lien courant : la surcharge du lien est prioritaire sur le binding version. */
  linkId: string | null;
  contractKey: string;
};

export type DefaultBindingQuery = {
  organizationId: string;
  templateVersionId: string;
  contractKey: string;
};

export type TemplateDataBindingFields = {
  name: string;
  queryText: string;
  rootPath: string;
  rootKey: string;
  children: TemplateDataBinding["children"];
  queryInputs: TemplateDataBinding["queryInputs"];
  invalidateOn: TemplateDataBinding["invalidateOn"];
  cacheTtlSeconds: number;
  maxRows: number;
  enabled: boolean;
};

export type CreateTemplateDataBindingInput = TemplateDataBindingFields & {
  organizationId: string;
  templateVersionId: string;
  contractKey: string;
  actorId: string | null;
};

export type UpdateTemplateDataBindingInput = TemplateDataBindingFields & {
  organizationId: string;
  actorId: string | null;
};

export type SaveTemplateDataBindingInput = {
  organizationId: string;
  templateVersionId: string;
  contractKey: string;
  queryText: string;
  rootPath: string;
  rootKey: string;
  children: TemplateDataBinding["children"];
  queryInputs: TemplateDataBinding["queryInputs"];
  invalidateOn: TemplateDataBinding["invalidateOn"];
  cacheTtlSeconds: number;
  maxRows: number;
  enabled: boolean;
  actorId: string | null;
};

export interface TemplateDataBindingRepository {
  /** Binding effectif : surcharge du lien, sinon défaut de la version. */
  findEffective(query: EffectiveBindingQuery): Promise<TemplateDataBinding | null>;
  /** Binding par défaut (même désactivé) — aperçu et édition. */
  findDefault(query: DefaultBindingQuery): Promise<TemplateDataBinding | null>;
  /** Bindings par défaut d'une version (une ligne par contrat). */
  listDefaults(organizationId: string, templateVersionId: string): Promise<TemplateDataBinding[]>;
  /** Crée ou met à jour le binding par défaut du contrat (révision +1). */
  upsertDefault(input: SaveTemplateDataBindingInput): Promise<TemplateDataBinding>;
  /** Tous les bindings (défaut + variantes) d'une version. */
  listForVersion(organizationId: string, templateVersionId: string): Promise<TemplateDataBinding[]>;
  findById(organizationId: string, id: string): Promise<TemplateDataBinding | null>;
  /** Crée une variante (`is_default = false`). */
  create(input: CreateTemplateDataBindingInput): Promise<TemplateDataBinding>;
  updateById(
    organizationId: string,
    id: string,
    input: UpdateTemplateDataBindingInput,
  ): Promise<TemplateDataBinding | null>;
  /** Rend ce binding défaut (l'ancien défaut devient une variante). */
  setDefault(organizationId: string, id: string): Promise<TemplateDataBinding | null>;
  /** Supprime une source ; si c'est le défaut, promeut une autre source. */
  deleteWithPromotion(
    organizationId: string,
    id: string,
  ): Promise<{ deleted: boolean; promotedId: string | null }>;
  countLinkUsages(id: string): Promise<number>;
}
