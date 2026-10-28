"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { LinkFilter } from "@/components/ui/LinkFilter";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import type { FicheArchiveFilter } from "@/domain/entities/fiche";
import { FicheForm } from "./FicheForm";
import type { FicheDto } from "./types";

/** Prospect affichable (extrait minimal du prospect rattaché). */
export type ProspectSummary = {
  nom: string;
};

const FILTRES: readonly { key: FicheArchiveFilter; label: string }[] = [
  { key: "actives", label: "Actives" },
  { key: "archivees", label: "Archivées" },
  { key: "toutes", label: "Toutes" },
];

/**
 * Table des fiches de prospection : filtre d'archivage (serveur), création,
 * téléchargement et archivage (US-FICHE-001/002).
 */
export function FichesTable({
  initialFiches,
  prospectsById,
  canWrite,
  filtre,
  lien,
  linkLabels,
}: {
  initialFiches: FicheDto[];
  prospectsById: Record<string, ProspectSummary>;
  canWrite: boolean;
  filtre: FicheArchiveFilter;
  lien: readonly string[];
  linkLabels: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("fr");
  const visibleFiches = initialFiches.filter((fiche) => {
    if (query === "") return true;
    const prospect = fiche.prospectId === null ? null : (prospectsById[fiche.prospectId] ?? null);
    return [prospect?.nom ?? "", fiche.templateKey]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query);
  });
  const pagination = usePagination(visibleFiches, 9, `${search}|${filtre}|${lien.join(",")}`);
  const toast = useToast();
  useToastOnMessage(error);

  const refresh = (): void => {
    router.refresh();
  };

  const toggleArchive = async (fiche: FicheDto): Promise<void> => {
    setError(null);
    const archivee = !fiche.archivee;
    if (
      archivee &&
      !(await confirmDialog(
        "Archiver cette fiche ? Elle sera masquée par défaut (consultable via le filtre « Archivées »).",
      ))
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/fiches/${fiche.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivee }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Action impossible");
        return;
      }
      toast.success(archivee ? "Fiche archivée." : "Fiche désarchivée.");
      refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div className="fiches-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <nav className="subtabs" aria-label="Filtrer les fiches">
        {FILTRES.map((item) => {
          const params = new URLSearchParams({ filtre: item.key });
          for (const label of lien) params.append("lien", label);
          return (
            <a
              key={item.key}
              href={`/leads?${params.toString()}`}
              className={`subtab ${filtre === item.key ? "active" : ""}`}
              aria-current={filtre === item.key ? "page" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="list-filters">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un prospect, un modèle…"
          label="Rechercher une fiche"
        />
        <LinkFilter basePath="/leads" value={lien} labels={linkLabels} preserve={{ filtre }} />
      </div>

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle fiche
          </button>
        </div>
      ) : null}

      <div className="lead-grid">
        {pagination.pageItems.map((fiche) => {
          const prospect =
            fiche.prospectId === null ? null : (prospectsById[fiche.prospectId] ?? null);
          return (
            <article key={fiche.id} className={`lead-card ${fiche.archivee ? "is-archived" : ""}`}>
              <header className="lead-card-head">
                <div>
                  <h2>
                    {prospect === null ? (
                      "Prospect libre"
                    ) : (
                      <a className="link" href={`/prospects?prospect=${fiche.prospectId}`}>
                        {prospect.nom}
                      </a>
                    )}
                  </h2>
                  <p>Créée le {new Date(fiche.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <span className={`badge ${fiche.archivee ? "muted" : "success"}`}>
                  {fiche.archivee ? "archivée" : "active"}
                </span>
              </header>
              <div className="lead-card-model">
                <span className="muted-text">Modèle</span>
                <span className="badge muted" title={fiche.templateKey}>
                  {fiche.templateKey}
                </span>
              </div>
              <footer className="lead-card-actions">
                <a className="btn small" href={`/leads/${fiche.id}`}>
                  Ouvrir
                </a>
                <details className="action-menu">
                  <summary className="btn ghost small" aria-label="Autres actions">
                    ⋯
                  </summary>
                  <div className="action-menu-panel">
                    <a href={`/api/fiche/${fiche.id}/download?format=pdf`}>Télécharger en PDF</a>
                    <a href={`/api/fiche/${fiche.id}/download`}>Télécharger en Markdown</a>
                    {canWrite ? (
                      <button type="button" onClick={() => void toggleArchive(fiche)}>
                        {fiche.archivee ? "Désarchiver" : "Archiver"}
                      </button>
                    ) : null}
                  </div>
                </details>
              </footer>
            </article>
          );
        })}
        {visibleFiches.length === 0 ? (
          <div className="empty-state">
            <strong>{initialFiches.length === 0 ? "Aucune fiche." : "Aucun résultat."}</strong>
            <span>
              {initialFiches.length === 0
                ? "Les fiches générées depuis une conversation apparaîtront ici."
                : "Modifiez la recherche ou les filtres."}
            </span>
          </div>
        ) : null}
      </div>
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={pagination.setPage}
        label="Pagination des fiches"
      />

      {creating ? (
        <Modal title="Nouvelle fiche de prospection" onClose={() => setCreating(false)}>
          <FicheForm
            onSaved={() => {
              setCreating(false);
              refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
