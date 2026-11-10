"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";

import { Prospect360Modal } from "./Prospect360Modal";
import { ProspectForm } from "./ProspectForm";
import { groupProspects } from "./prospect-grouping";
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
  origine: readonly string[];
  linkLabels: string[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<ProspectDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [fiche360Id, setFiche360Id] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const grouped = searchParams.get("grouper") !== "0" && filterProspectId == null;
  const groupQuery = groupSearch.trim().toLocaleLowerCase("fr");
  const query = search.trim().toLocaleLowerCase("fr");
  useToastOnMessage(error);

  // Filtre « ?prospect=<id> » : n'affiche que le prospect ciblé.
  const focused =
    filterProspectId === undefined || filterProspectId === null
      ? null
      : (initialProspects.find((prospect) => prospect.id === filterProspectId) ?? null);
  const visible = (focused === null ? initialProspects : [focused]).filter((prospect) => {
    if (query === "") return true;
    return [prospect.nom, prospect.prenom, prospect.email]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query);
  });
  const groups = groupProspects(initialProspects);
  const visibleGroups =
    groupQuery === ""
      ? groups
      : groups.filter((group) => group.label.toLocaleLowerCase("fr").includes(groupQuery));
  const pagination = usePagination(visible, 9, `${search}|${origine.join(",")}|${grouped}`);

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
    if (!(await confirmDialog(`Supprimer ${prospect.nom} ${prospect.prenom} ?`))) return;
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

      <div className="list-filters">
        <SearchInput
          value={grouped ? groupSearch : search}
          onChange={grouped ? setGroupSearch : setSearch}
          placeholder={grouped ? "Rechercher un chatbot…" : "Rechercher un nom, un email…"}
          label={grouped ? "Rechercher un chatbot" : "Rechercher un prospect"}
        />
        <FilterMenu
          sections={
            [
              {
                id: "origine",
                label: "Origine",
                options: [
                  { value: "manuel", label: "Manuels" },
                  ...[...new Set([...linkLabels, ...origine.map((value) => value.slice(5))])].map(
                    (label) => ({
                      value: `lien:${label}`,
                      label: label === "" ? "Chatbot sans nom" : label,
                    }),
                  ),
                ],
                value: origine,
              },
            ] satisfies FilterMenuSection[]
          }
          onApply={(values) => {
            const params = new URLSearchParams();
            if (!grouped) params.set("grouper", "0");
            for (const value of values.origine ?? []) params.append("origine", value);
            const query = params.toString();
            router.push(query === "" ? "/prospects" : `/prospects?${query}`);
          }}
        />
      </div>

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouveau prospect
          </button>
        </div>
      ) : null}

      {filterProspectId == null ? (
        <label className="inbox-group-toggle prospects-group-toggle">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams.toString());
              setGroupSearch("");
              if (event.target.checked) params.delete("grouper");
              else params.set("grouper", "0");
              const suffix = params.toString();
              router.replace(`/prospects${suffix === "" ? "" : `?${suffix}`}`, { scroll: false });
            }}
          />
          <span className="inbox-group-toggle-track" aria-hidden="true" />
          <span>Grouper par chatbot</span>
        </label>
      ) : null}

      {grouped ? (
        <div className="inbox-chatbot-cards conversations-overview-cards prospects-chatbot-cards">
          {visibleGroups.length === 0 ? (
            <div className="empty-state">
              <strong>{groups.length === 0 ? "Aucun prospect." : "Aucun chatbot trouvé."}</strong>
              <span>
                {groups.length === 0
                  ? "Les prospects issus d’un chatbot ou ajoutés manuellement apparaîtront ici."
                  : "Modifiez votre recherche."}
              </span>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <article className="inbox-chatbot-card" key={group.id}>
                <div className="inbox-chatbot-card-head">
                  <strong title={group.label}>{group.label}</strong>
                  <span className="badge">{group.total} prospect(s)</span>
                </div>
                <div className="inbox-chatbot-stats">
                  <span>
                    <b>{group.withEmail}</b>
                    <small>avec email</small>
                  </span>
                  <span>
                    <b>{group.withoutEmail}</b>
                    <small>sans contact</small>
                  </span>
                  <span>
                    <b>{group.total}</b>
                    <small>total</small>
                  </span>
                </div>
                <div className="inbox-chatbot-card-foot">
                  <span className="hint">
                    {group.lastCreatedAt === null
                      ? "Aucun prospect"
                      : `Dernier ajout le ${new Date(group.lastCreatedAt).toLocaleDateString("fr-FR")}`}
                  </span>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      params.delete("prospect");
                      params.set("grouper", "0");
                      params.set(
                        "origine",
                        group.manual
                          ? "manuel"
                          : `lien:${group.label === "Chatbot sans nom" ? "" : group.label}`,
                      );
                      router.push(`/prospects?${params.toString()}`, { scroll: false });
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
                {pagination.pageItems.map((prospect) => (
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
                    <td colSpan={5}>
                      {initialProspects.length === 0 ? "Aucun prospect." : "Aucun résultat."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={pagination.setPage}
            label="Pagination des prospects"
          />
        </>
      )}

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
