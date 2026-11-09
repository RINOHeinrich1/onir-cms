/**
 * Matrice type de champ × opérateur sémantique (ADR-0067 §4.6).
 * Les champs `file` ne sont jamais interrogeables : aucun opérateur.
 */

import type { TemplateFieldType } from "@/domain/entities/chat-template";
import type { FicheSearchOperator } from "@/domain/fiche-search-tool";

const TEXT_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "starts_with",
  "ends_with",
  "in",
  "exists",
  "is_empty",
] as const satisfies readonly FicheSearchOperator[];

const SELECT_OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "exists",
  "is_empty",
] as const satisfies readonly FicheSearchOperator[];

const MULTI_OPERATORS = [
  "contains_any",
  "contains_all",
  "contains_none",
  "exists",
  "is_empty",
] as const satisfies readonly FicheSearchOperator[];

const NUMBER_OPERATORS = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "in",
  "exists",
] as const satisfies readonly FicheSearchOperator[];

const DATE_OPERATORS = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "exists",
] as const satisfies readonly FicheSearchOperator[];

const IMAGE_OPERATORS = ["exists", "is_empty"] as const satisfies readonly FicheSearchOperator[];

export const OPERATORS_BY_FIELD_TYPE: Record<TemplateFieldType, readonly FicheSearchOperator[]> = {
  text: TEXT_OPERATORS,
  textarea: TEXT_OPERATORS,
  url: TEXT_OPERATORS,
  email: TEXT_OPERATORS,
  select: SELECT_OPERATORS,
  multi: MULTI_OPERATORS,
  number: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
  image: IMAGE_OPERATORS,
  file: [],
  fiche: [],
  tableau_de_fiches: [],
};

export function operatorsForFieldType(type: TemplateFieldType): readonly FicheSearchOperator[] {
  return OPERATORS_BY_FIELD_TYPE[type];
}

export function isOperatorAllowedForFieldType(
  type: TemplateFieldType,
  operator: FicheSearchOperator,
): boolean {
  return operatorsForFieldType(type).includes(operator);
}
