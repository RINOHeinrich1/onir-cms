"use client";

import type { VisualTemplateOption } from "@/components/links/types";
import { TemplateCover } from "@/components/templates/TemplateCover";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import { latestTemplateVersion } from "@/domain/template-version";
import { StudioIcon } from "./StudioIcon";
import { parseSelection, selectionFor } from "./studio-utils";

type Props = {
  templates: VisualTemplateOption[];
  selection: string;
  surface: ChatLinkSurface;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (selection: string) => void;
};

export function StudioGallery({
  templates,
  selection,
  surface,
  search,
  onSearchChange,
  onSelect,
}: Props) {
  const needle = search.trim().toLowerCase();
  const visible = templates
    .filter((template) => {
      if (surface === "widget" && !template.versions.some((version) => version.widget !== null)) {
        return false;
      }
      if (needle === "") return true;
      return [template.name, template.key, template.description]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const selected = parseSelection(selection);

  return (
    <aside className="studio-panel studio-panel--gallery">
      <div className="studio-panel-head">
        <div>
          <p className="studio-eyebrow">Bibliothèque</p>
          <h2>Modèles</h2>
        </div>
        <span className="studio-count">{visible.length}</span>
      </div>

      <label className="studio-search">
        <StudioIcon name="search" size={15} />
        <input
          type="search"
          value={search}
          placeholder="Rechercher un modèle…"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      {templates.length === 0 ? (
        <div className="studio-empty studio-empty--panel">
          <span className="studio-empty-icon">
            <StudioIcon name="layers" size={22} />
          </span>
          <strong>Aucun template installé</strong>
          <p>Importez un template visuel pour commencer la personnalisation.</p>
          <a className="btn ghost small" href="/templates-visuels">
            Ouvrir la bibliothèque
          </a>
        </div>
      ) : visible.length === 0 ? (
        <div className="studio-empty studio-empty--panel">
          <span className="studio-empty-icon">
            <StudioIcon name="search" size={22} />
          </span>
          <strong>Aucun résultat</strong>
          <p>
            {surface === "widget"
              ? "Aucun modèle compatible avec le widget ne correspond à cette recherche."
              : "Essayez un autre nom ou une autre clé de template."}
          </p>
        </div>
      ) : (
        <div className="studio-gallery-list">
          {visible.map((template) => {
            const versions =
              surface === "widget"
                ? template.versions.filter((version) => version.widget !== null)
                : template.versions;
            const latest = latestTemplateVersion(versions);
            const isSelected = selected.id === template.id;
            const activeVersion =
              isSelected && selected.version !== null
                ? (versions.find((version) => version.version === selected.version) ?? latest)
                : latest;
            const coverVersion = activeVersion?.version ?? null;

            return (
              <article
                key={template.id}
                className={`studio-template-card${isSelected ? " is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="studio-template-card-main"
                  onClick={() => {
                    if (activeVersion === null) return;
                    onSelect(selectionFor(template.id, activeVersion.version));
                  }}
                >
                  <span className="studio-template-cover">
                    <TemplateCover
                      templateId={template.id}
                      version={coverVersion}
                      name={template.name}
                    />
                    {isSelected ? (
                      <span className="studio-template-check">
                        <StudioIcon name="check" size={13} />
                      </span>
                    ) : null}
                  </span>
                  <span className="studio-template-meta">
                    <strong>{template.name}</strong>
                    <small>{template.key}</small>
                  </span>
                </button>

                <label className="studio-template-version">
                  <span>Version</span>
                  <span className="studio-select-wrap">
                    <select
                      value={
                        isSelected && selected.version !== null
                          ? selection
                          : activeVersion === null
                            ? ""
                            : selectionFor(template.id, activeVersion.version)
                      }
                      disabled={versions.length === 0}
                      onChange={(event) => onSelect(event.target.value)}
                    >
                      {versions.length === 0 ? <option value="">Aucune</option> : null}
                      {versions.map((version) => (
                        <option
                          key={version.version}
                          value={selectionFor(template.id, version.version)}
                        >
                          {version.version}
                          {version.widget === null ? " · page" : ""}
                        </option>
                      ))}
                    </select>
                    <StudioIcon name="chevron" size={13} />
                  </span>
                </label>
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}
