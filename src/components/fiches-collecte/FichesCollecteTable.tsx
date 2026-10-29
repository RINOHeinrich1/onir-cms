"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { FicheCollecteDto } from "./types";

/** Liste des fiches de collecte réutilisables (ADR-0049). */
export function FichesCollecteTable({
  initialFiches,
  canWrite,
}: {
  initialFiches: FicheCollecteDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<FicheCollecteDto[]>(initialFiches);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const remove = async (fiche: FicheCollecteDto): Promise<void> => {
    if (!(await confirmDialog(`Supprimer la fiche « ${fiche.label} » et son historique ?`))) {
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/fiches-collecte/${fiche.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== fiche.id));
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <Link href="/fiches-collecte/nouveau" className="btn small">
            Nouvelle fiche de collecte
          </Link>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Clé</th>
              <th>Champs</th>
              <th>Version</th>
              <th>Mise à jour</th>
              {canWrite ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((fiche) => (
              <tr key={fiche.id}>
                <td data-label="Libellé">
                  <Link href={`/fiches-collecte/${fiche.id}`}>
                    <strong>{fiche.label}</strong>
                  </Link>
                  {fiche.description === "" ? null : (
                    <div className="muted-text">{fiche.description}</div>
                  )}
                </td>
                <td data-label="Clé">
                  <span className="badge muted">{fiche.key}</span>
                </td>
                <td data-label="Champs">{fiche.fields.length}</td>
                <td data-label="Version">v{fiche.version}</td>
                <td data-label="Mise à jour">{fiche.updatedAt.slice(0, 10)}</td>
                {canWrite ? (
                  <td data-label="Actions" className="cell-actions">
                    <div className="tools">
                      <Link href={`/fiches-collecte/${fiche.id}`} className="btn ghost small">
                        Modifier
                      </Link>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void remove(fiche)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>
                  Aucune fiche de collecte. Créez une fiche réutilisable pour l’importer dans vos
                  chatbots.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
