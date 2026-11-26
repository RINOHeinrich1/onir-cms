import type { TemplateStructureScope } from "./template-edit-structure";
import type { TemplateEditorManifest } from "./template-editor";
import type { TemplateParamValues } from "./template-params";

export type TemplateEditTargetKind = "page" | "collectionItem";

export type TemplateEditTarget = {
  kind: TemplateEditTargetKind;
  collection: string;
  itemKey: string;
  itemId: string;
  label: string;
  itemKind?: string;
  pageId?: string;
  scope: TemplateStructureScope;
};

export type TemplateEditCandidate = TemplateEditTarget & {
  score: number;
  reasons: string[];
};

export type TemplateEditHints = {
  wantsPage: boolean;
  wantsButton: boolean;
  wantsCard: boolean;
  wantsImage: boolean;
  wantsSection: boolean;
  wantsStyle: boolean;
};

export type TemplateEditPageContext = {
  pageId: string;
  label: string;
  source: "explicit" | "current";
};

export type ResolveTemplateEditTargetInput = {
  request: string;
  editor: TemplateEditorManifest;
  values: TemplateParamValues;
  currentPageId?: string | null;
  selection?: { regionId: string } | null;
  limit?: number;
};

export type ResolveTemplateEditTargetResult = {
  page: TemplateEditPageContext | null;
  hints: TemplateEditHints;
  candidates: TemplateEditCandidate[];
};
