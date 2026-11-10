"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import { findFicheStatus } from "@/domain/entities/fiche-status";
import { FicheForm } from "./FicheForm";
import { groupFichesByChatbot } from "./lead-grouping";
import type { FicheDto } from "./types";

/** Prospect affichable (extrait minimal du prospect rattaché). */
export type ProspectSummary = {
  nom: string;
};

/**
 * Table des fiches de prospection : filtre d'archivage (serveur), création,
 * téléchargement et archivage (US-FICHE-001/002).
 */
export function FichesTable({
  initialFiches,
  prospectsById,
  canWrite,
  archive,
  lien,
  statut,
  linkLabels,
  chatLinks,
}: {
  initialFiches: FicheDto[];
  prospectsById: Record<string, ProspectSummary>;
  canWrite: boolean;
  archive: readonly string[];
  lien: readonly string[];
  statut: readonly string[];
  linkLabels: string[];
  chatLinks: readonly { id: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const grouped = searchParams.get("grouper") !== "0";
  const sansChatbotFilter = searchParams.get("sans_chatbot") === "1";
  const query = search.trim().toLocaleLowerCase("fr");
  const visibleFiches = initialFiches.filter((fiche) => {
    if (sansChatbotFilter && (fiche.chatLinkIds ?? []).length > 0) return false;
    if (grouped || query === "") return true;
    const prospect = fiche.prospectId === null ? null : (prospectsById[fiche.prospectId] ?? null);
    return [prospect?.nom ?? "", fiche.definition?.label ?? ""]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query);
  });
  const chatbotGroups = groupFichesByChatbot(visibleFiches, chatLinks);
  const groupQuery = groupSearch.trim().toLocaleLowerCase("fr");
  const visibleChatbotGroups =
    groupQuery === ""
      ? chatbotGroups
      : chatbotGroups.filter((group) => group.label.toLocaleLowerCase("fr").includes(groupQuery));
  const pagination = usePagination(
    visibleFiches,
    9,
    `${search}|${archive.join(",")}|${lien.join(",")}|${statut.join(",")}|${grouped}|${sansChatbotFilter}`,
  );
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

      <div className="list-filters">
        <SearchInput
          value={grouped ? groupSearch : search}
          onChange={grouped ? setGroupSearch : setSearch}
          placeholder={grouped ? "Rechercher un chatbot…" : "Rechercher un prospect, une fiche…"}
          label={grouped ? "Rechercher un chatbot" : "Rechercher une fiche"}
        />
        <FilterMenu
          sections={
            [
              {
                id: "archive",
                label: "Archivage",
                options: [
                  { value: "actives", label: "Actives" },
                  { value: "archivees", label: "Archivées" },
                ],
                value: archive,
              },
              {
                id: "lien",
                label: "Chatbot",
                options: [...new Set([...linkLabels, ...lien])].map((label) => ({
                  value: label,
                  label: label === "" ? "Chatbot sans nom" : label,
                })),
                value: lien,
              },
              {
                id: "statut",
                label: "Statut de qualification",
                options: [
                  ...new Map(
                    initialFiches.flatMap((fiche) =>
                      (fiche.definition?.statuses ?? []).map((status) => [
                        status.key,
                        status.label,
                      ]),
                    ),
                  ).entries(),
                ].map(([value, label]) => ({ value, label })),
                value: statut,
              },
            ] satisfies FilterMenuSection[]
          }
          onApply={(values) => {
            const params = new URLSearchParams({ onglet: "fiches" });
            if (!grouped) params.set("grouper", "0");
            if (sansChatbotFilter) params.set("sans_chatbot", "1");
            if ((values.archive ?? []).length === 0) params.append("archive", "");
            for (const value of values.archive ?? []) params.append("archive", value);
            for (const value of values.lien ?? []) params.append("lien", value);
            for (const value of values.statut ?? []) params.append("statut", value);
            router.push(`/leads?${params.toString()}`);
          }}
        />
      </div>

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle fiche
          </button>
        </div>
      ) : null}

      <label className="inbox-group-toggle leads-group-toggle">
        <input
          type="checkbox"
          checked={grouped}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            setGroupSearch("");
            if (event.target.checked) {
              params.delete("grouper");
              params.delete("sans_chatbot");
            } else {
              params.set("grouper", "0");
            }
            const suffix = params.toString();
            router.replace(`/leads${suffix === "" ? "" : `?${suffix}`}`, { scroll: false });
          }}
        />
        <span className="inbox-group-toggle-track" aria-hidden="true" />
        <span>Grouper par chatbot</span>
      </label>

      {grouped ? (
        <div className="inbox-chatbot-cards conversations-overview-cards leads-chatbot-cards">
          {visibleChatbotGroups.length === 0 ? (
            <div className="empty-state">
              <strong>
                {chatbotGroups.length === 0 ? "Aucun chatbot." : "Aucun chatbot trouvé."}
              </strong>
              <span>
                {chatbotGroups.length === 0
                  ? "Créez un chatbot ou une fiche pour voir les leads ici."
                  : "Modifiez votre recherche."}
              </span>
            </div>
          ) : (
            visibleChatbotGroups.map((group) => (
              <article className="inbox-chatbot-card" key={group.id}>
                <div className="inbox-chatbot-card-head">
                  <strong title={group.label}>{group.label}</strong>
                  <span className="badge">{group.total} fiche(s)</span>
                </div>
                <div className="inbox-chatbot-stats">
                  <span>
                    <b>{group.active}</b>
                    <small>actives</small>
                  </span>
                  <span>
                    <b>{group.archived}</b>
                    <small>archivées</small>
                  </span>
                  <span>
                    <b>{group.qualified}</b>
                    <small>qualifiées</small>
                  </span>
                </div>
                <div className="inbox-chatbot-card-foot">
                  <span className="hint">
                    {group.lastCreatedAt === null
                      ? "Aucune fiche"
                      : `Dernière fiche le ${new Date(group.lastCreatedAt).toLocaleDateString("fr-FR")}`}
                  </span>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      params.set("onglet", "fiches");
                      params.set("grouper", "0");
                      params.delete("sans_chatbot");
                      if (group.sansChatbot) {
                        params.delete("lien");
                        params.set("sans_chatbot", "1");
                      } else {
                        params.set("lien", group.label === "Chatbot sans nom" ? "" : group.label);
                      }
                      router.push(`/leads?${params.toString()}`, { scroll: false });
                    }}
                  >
                    Ouvrir
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="lead-grid">
            {pagination.pageItems.map((fiche) => {
              const prospect =
                fiche.prospectId === null ? null : (prospectsById[fiche.prospectId] ?? null);
              return (
                <article
                  key={fiche.id}
                  className={`lead-card ${fiche.archivee ? "is-archived" : ""}`}
                >
                  <header className="lead-card-head">
                    <div>
                      <h2>
                        {prospect === null ? (
                          "Ajout Manuel"
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
                    <span className="muted-text">Fiche</span>
                    <span className="badge muted" title={fiche.definition?.key ?? "Fiche manuelle"}>
                      {fiche.definition?.label ?? "Fiche manuelle"}
                    </span>
                  </div>
                  <div className="lead-card-model">
                    <span className="muted-text">Qualification</span>
                    {(() => {
                      const status = findFicheStatus(
                        fiche.definition?.statuses,
                        fiche.qualificationStatusKey,
                      );
                      return status === null ? (
                        <span className="badge muted">Non qualifiée</span>
                      ) : (
                        <span
                          className="badge"
                          style={status.color ? { color: status.color } : undefined}
                        >
                          {status.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="lead-card-model">
                    <span className="muted-text">Chatbots</span>
                    {(fiche.chatLinkIds ?? []).length === 0 ? (
                      <span className="badge muted">Aucun</span>
                    ) : (
                      (fiche.chatLinkIds ?? []).map((id) => (
                        <span key={id} className="badge muted">
                          {chatLinks.find((link) => link.id === id)?.label || "Chatbot"}
                        </span>
                      ))
                    )}
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
                        <a href={`/api/fiche/${fiche.id}/download?format=pdf`}>
                          Télécharger en PDF
                        </a>
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
                    ? "Les fiches manuelles et générées depuis une conversation apparaîtront ici."
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
        </>
      )}

      {creating ? (
        <Modal title="Nouvelle fiche de prospection" onClose={() => setCreating(false)}>
          <FicheForm
            links={chatLinks}
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
