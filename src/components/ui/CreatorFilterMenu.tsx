"use client";

import { type CreatorOption, NO_CREATOR } from "@/components/ui/creator-options";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";

/** Menu de filtre unique pour les listes qui ne filtrent que par créateur. */
export function CreatorFilterMenu({
  options,
  showUnassigned,
  value,
  onChange,
}: {
  options: CreatorOption[];
  showUnassigned: boolean;
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const filterOptions = [
    ...options.map((option) => ({ value: option.id, label: option.label })),
    ...(showUnassigned ? [{ value: NO_CREATOR, label: "Non renseigné" }] : []),
  ];

  return (
    <FilterMenu
      sections={
        [
          {
            id: "createur",
            label: "Créateur",
            options: filterOptions,
            value,
          },
        ] satisfies FilterMenuSection[]
      }
      onApply={(values) => onChange(values.createur ?? [])}
    />
  );
}
