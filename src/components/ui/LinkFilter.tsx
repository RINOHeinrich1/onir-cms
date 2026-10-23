"use client";

import { useRouter } from "next/navigation";

const ALL_LINKS = "__all__";
const LABEL_PREFIX = "label:";

/**
 * Filtre par libellé de lien de chat (valeur = libellé exact).
 * `null` = tous les liens ; `""` = liens sans nom.
 */
export function LinkFilter({
  basePath,
  value,
  labels,
  preserve = {},
}: {
  basePath: string;
  value: string | null;
  labels: string[];
  preserve?: Record<string, string>;
}) {
  const router = useRouter();
  const options = value !== null && !labels.includes(value) ? [value, ...labels] : labels;

  const apply = (next: string | null): void => {
    const params = new URLSearchParams(preserve);
    if (next !== null) params.set("lien", next);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  return (
    <label className="link-filter">
      <span className="link-filter-label">Lien de chat</span>
      <select
        aria-label="Filtrer par lien de chat"
        value={value === null ? ALL_LINKS : `${LABEL_PREFIX}${value}`}
        onChange={(event) => {
          const next = event.target.value;
          apply(next === ALL_LINKS ? null : next.slice(LABEL_PREFIX.length));
        }}
      >
        <option value={ALL_LINKS}>Tous les liens</option>
        {options.map((label) => (
          <option key={`${LABEL_PREFIX}${label}`} value={`${LABEL_PREFIX}${label}`}>
            {label === "" ? "Lien sans nom" : label}
          </option>
        ))}
      </select>
    </label>
  );
}
