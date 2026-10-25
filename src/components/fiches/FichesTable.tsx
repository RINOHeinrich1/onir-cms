"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkFilter } from "@/components/ui/LinkFilter";
import { Modal } from "@/components/ui/Modal";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
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
  lien: string | null;
  linkLabels: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      !window.confirm(
        "Archiver cette fiche ? Elle sera masquée par défaut (consultable via le filtre « Archivées »).",
      )
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
          if (lien !== null) params.set("lien", lien);
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

      <LinkFilter basePath="/leads" value={lien} labels={linkLabels} preserve={{ filtre }} />

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle fiche
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Prospect</th>
              <th>Modèle</th>
              <th>État</th>
              <th>Créée le</th>
              <th>Rapport</th>
            </tr>
          </thead>
          <tbody>
            {initialFiches.map((fiche) => {
              const prospect =
                fiche.prospectId === null ? null : (prospectsById[fiche.prospectId] ?? null);

              return (
                <tr key={fiche.id} className={fiche.archivee ? "row-archivee" : undefined}>
                  <td>
                    {prospect === null ? (
                      <span className="muted-text">Prospect libre</span>
                    ) : (
                      <a className="link" href={`/prospects?prospect=${fiche.prospectId}`}>
                        {prospect.nom}
                      </a>
                    )}
                  </td>
                  <td>
                    <span className="badge muted" title={fiche.templateKey}>
                      {fiche.templateKey}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${fiche.archivee ? "muted" : ""}`}>
                      {fiche.archivee ? "archivée" : "active"}
                    </span>
                  </td>
                  <td>{new Date(fiche.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <div className="tools">
                      <a className="btn small" href={`/leads/${fiche.id}`}>
                        Regarder
                      </a>
                      <a
                        className="btn ghost small"
                        href={`/api/fiche/${fiche.id}/download?format=pdf`}
                      >
                        PDF
                      </a>
                      <a className="btn ghost small" href={`/api/fiche/${fiche.id}/download`}>
                        Markdown
                      </a>
                      {canWrite ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => void toggleArchive(fiche)}
                        >
                          {fiche.archivee ? "Désarchiver" : "Archiver"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {initialFiches.length === 0 ? (
              <tr>
                <td colSpan={5}>Aucune fiche.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
