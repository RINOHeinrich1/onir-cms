"use client";

import { useRouter } from "next/navigation";

const ALL_ORIGINS = "__all__";
const MANUEL = "manuel";
const LINK_PREFIX = "lien:";

/**
 * Filtre d'origine des prospects : tous, manuels, ou un lien de chat précis.
 * La valeur d'un lien reste son libellé exact, préfixé par `lien:`.
 */
export function OriginFilter({
  value,
  linkLabels,
}: {
  /** Valeur sérialisée (`manuel` / `lien:<libellé>`), null = toutes. */
  value: string | null;
  linkLabels: string[];
}) {
  const router = useRouter();
  const activeLabel = value?.startsWith(LINK_PREFIX) ? value.slice(LINK_PREFIX.length) : null;
  const labels =
    activeLabel !== null && !linkLabels.includes(activeLabel)
      ? [activeLabel, ...linkLabels]
      : linkLabels;

  const apply = (next: string): void => {
    if (next === ALL_ORIGINS) {
      router.push("/prospects", { scroll: false });
      return;
    }
    const params = new URLSearchParams({ origine: next });
    router.push(`/prospects?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="link-filter">
      <span className="link-filter-label">Origine</span>
      <select
        aria-label="Filtrer les prospects par origine"
        value={value ?? ALL_ORIGINS}
        onChange={(event) => apply(event.target.value)}
      >
        <option value={ALL_ORIGINS}>Toutes les origines</option>
        <option value={MANUEL}>Manuels</option>
        {labels.map((label) => (
          <option key={`${LINK_PREFIX}${label}`} value={`${LINK_PREFIX}${label}`}>
            {label === "" ? "Chatbot sans nom" : label}
          </option>
        ))}
      </select>
    </label>
  );
}
