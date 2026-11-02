"use client";

import { NO_CREATOR } from "@/components/ui/creator-options";
import type { FilterMenuSection } from "@/components/ui/FilterMenu";
import { FilterMenu } from "@/components/ui/FilterMenu";

export type ConnaissancesFilterValues = {
  createur: string[];
  portee: string[];
};

/** Filtre connaissances : créateur + portée, avec recherche intégrée pour les longues listes. */
export function ConnaissancesFilterMenu({
  creatorOptions,
  showUnassigned,
  scopeOptions,
  creatorValue,
  scopeValue,
  onApply,
}: {
  creatorOptions: { id: string; label: string }[];
  showUnassigned: boolean;
  scopeOptions: { value: string; label: string }[];
  creatorValue: string[];
  scopeValue: string[];
  onApply: (values: ConnaissancesFilterValues) => void;
}) {
  const sections = [
    {
      id: "createur",
      label: "Créateur",
      options: [
        ...creatorOptions.map((option) => ({ value: option.id, label: option.label })),
        ...(showUnassigned ? [{ value: NO_CREATOR, label: "Non renseigné" }] : []),
      ],
      value: creatorValue,
    },
    {
      id: "portee",
      label: "Portée",
      options: scopeOptions,
      value: scopeValue,
    },
  ] satisfies FilterMenuSection[];

  return (
    <FilterMenu
      sections={sections}
      onApply={(values) =>
        onApply({
          createur: values.createur ?? [],
          portee: values.portee ?? [],
        })
      }
    />
  );
}
