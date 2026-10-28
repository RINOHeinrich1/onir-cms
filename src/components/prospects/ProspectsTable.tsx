"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { OriginFilter } from "./OriginFilter";
import { Prospect360Modal } from "./Prospect360Modal";
import { ProspectForm } from "./ProspectForm";
import type { ProspectDto } from "./types";

/** Table des prospects + opérations CRUD (US-PROSPECT-001, écriture admin/marketeur). */
export function ProspectsTable({
  initialProspects,
  filterProspectId,
  origine,
  linkLabels,
  canWrite,
}: {
  initialProspects: ProspectDto[];
  filterProspectId?: string | null;
  origine: string | null;
  linkLabels: string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProspectDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [fiche360Id, setFiche360Id] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  // Filtre « ?prospect=<id> » : n'affiche que le prospect ciblé.
  const focused =
    filterProspectId === undefined || filterProspectId === null
      ? null
      : (initialProspects.find((prospect) => prospect.id === filterProspectId) ?? null);
  const visible = focused === null ? initialProspects : [focused];

  const refresh = (): void => {
    router.refresh();
  };

  const onSaved = (): void => {
    setEditing(null);
    setCreating(false);
    refresh();
  };

  const remove = async (prospect: ProspectDto): Promise<void> => {
    setError(null);
    if (!window.confirm(`Supprimer ${prospect.nom} ${prospect.prenom} ?`)) return;
    try {
      const response = await fetch(`/api/prospects/${prospect.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div className="prospects-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      {filterProspectId != null ? (
        <p className="alert" style={{ marginBottom: "1.5rem" }}>
          {focused === null ? (
            "Prospect introuvable."
          ) : (
            <>
              Filtré sur <strong>{`${focused.nom} ${focused.prenom}`.trim()}</strong>.{" "}
            </>
          )}
          <a className="link" href="/prospects">
            Voir tous les prospects
          </a>
        </p>
      ) : null}

      <OriginFilter value={origine} linkLabels={linkLabels} />

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouveau prospect
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Nature</th>
              <th>Origine</th>
              <th>Email</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map((prospect) => (
              <tr key={prospect.id}>
                <td data-label="Nom">
                  {prospect.nom} {prospect.prenom}
                </td>
                <td data-label="Nature">
                  <span className="badge">{prospect.nature}</span>
                </td>
                <td data-label="Origine">
                  {prospect.origine === "libre" ? (
                    <>
                      <span className="badge orange">Libre</span>
                      <div className="muted-text">
                        {prospect.lienLabel === null || prospect.lienLabel === ""
                          ? "via un lien sans nom"
                          : `via « ${prospect.lienLabel} »`}
                      </div>
                    </>
                  ) : (
                    <span className="badge muted">Saisie</span>
                  )}
                </td>
                <td data-label="Email">
                  {prospect.email === "" ? (
                    <span className="badge warn">Contact non fourni</span>
                  ) : (
                    prospect.email
                  )}
                </td>
                <td data-label="Actions" className="cell-actions">
                  <div className="tools">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setFiche360Id(prospect.id)}
                    >
                      Fiche 360
                    </button>
                    {canWrite ? (
                      <>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => setEditing(prospect)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="btn danger ghost small"
                          onClick={() => void remove(prospect)}
                        >
                          Supprimer
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5}>Aucun prospect.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating || editing !== null ? (
        <Modal
          title={editing === null ? "Nouveau prospect" : `Modifier ${editing.nom}`}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        >
          <ProspectForm
            editing={editing}
            onSaved={onSaved}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </Modal>
      ) : null}

      {fiche360Id !== null ? (
        <Prospect360Modal prospectId={fiche360Id} onClose={() => setFiche360Id(null)} />
      ) : null}
    </div>
  );
}
