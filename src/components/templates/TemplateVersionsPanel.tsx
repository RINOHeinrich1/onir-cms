"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { modeLabel, trustLabel } from "./template-labels";

export type TemplateVersionSummary = {
  id: string;
  version: string;
  mode: string;
  trustLevel: string;
  createdAt: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Europe/Paris",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

export function TemplateVersionsPanel({
  templateId,
  versions,
  selectedVersion,
}: {
  templateId: string;
  versions: TemplateVersionSummary[];
  selectedVersion: string | null;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return versions;
    return versions.filter((version) =>
      [
        version.version,
        version.mode,
        modeLabel(version.mode),
        version.trustLevel,
        trustLabel(version.trustLevel),
        formatDate(version.createdAt),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, versions]);

  const visible = showAll ? filtered : filtered.slice(0, 8);

  return (
    <section className="card template-versions">
      <div className="template-versions-head">
        <h2>Versions</h2>
        <span className="badge muted">{versions.length}</span>
      </div>
      <label className="field template-version-search">
        Rechercher
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowAll(false);
          }}
          placeholder="4.44, web-component, officiel…"
        />
      </label>

      {visible.length === 0 ? (
        <p className="hint">Aucune version ne correspond à la recherche.</p>
      ) : (
        <nav aria-label="Versions du template">
          <ul className="version-list">
            {visible.map((version) => {
              const latest = versions[0]?.id === version.id;
              const active = selectedVersion === version.version;
              return (
                <li key={version.id}>
                  <Link
                    className={`version-item${active ? " is-active" : ""}`}
                    href={`/templates-visuels/${templateId}?version=${encodeURIComponent(version.version)}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="version-item-head">
                      <strong>{version.version}</strong>
                      {latest ? <span className="badge orange">Dernière importée</span> : null}
                    </span>
                    <span className="version-item-meta">
                      {formatDate(version.createdAt)} · {modeLabel(version.mode)} ·{" "}
                      {trustLabel(version.trustLevel)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {filtered.length > 8 ? (
        <button
          type="button"
          className="btn ghost small template-versions-more"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Réduire" : `Afficher les ${filtered.length - 8} autres`}
        </button>
      ) : null}
    </section>
  );
}
