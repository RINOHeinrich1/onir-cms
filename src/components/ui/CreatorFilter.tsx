"use client";

import type { CreatorOption } from "./creator-options";
import { NO_CREATOR } from "./creator-options";

const ALL_CREATORS = "__all__";

export function CreatorFilter({
  options,
  showUnassigned,
  value,
  onChange,
}: {
  options: CreatorOption[];
  showUnassigned: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="link-filter">
      <span className="link-filter-label">Créé par</span>
      <select
        aria-label="Filtrer par créateur"
        value={value ?? ALL_CREATORS}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === ALL_CREATORS ? null : next);
        }}
      >
        <option value={ALL_CREATORS}>Tous les créateurs</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {showUnassigned ? <option value={NO_CREATOR}>Non renseigné</option> : null}
      </select>
    </label>
  );
}
