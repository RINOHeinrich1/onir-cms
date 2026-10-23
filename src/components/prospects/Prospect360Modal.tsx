"use client";

import { useEffect, useRef, useState } from "react";

type Contact = { type: string; valeur: string; source: "prospect" | "conversation" };

type ConversationSummary = {
  id: string;
  createdAt: string;
  nom: string;
  email: string;
  contacts: { type: string; valeur: string }[];
};

type FicheSummary = {
  id: string;
  plateformes: string[];
  budget: string;
  duree: string;
  statut: "initier" | "reprendre";
  createdAt: string;
};

type ProspectFiche360 = {
  prospect: {
    nom: string;
    prenom: string;
    nature: "physique" | "morale";
    email: string;
    origine: "saisie" | "libre";
    lienLabel: string | null;
    activite: string;
    fonction: string;
    detail: string;
  };
  contacts: Contact[];
  conversations: ConversationSummary[];
  fiches: FicheSummary[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR");
}

/**
 * Modale « fiche 360 » d'un client : identité, tous ses contacts,
 * ses conversations et ses fiches de prospection. Chargée à l'ouverture.
 */
export function Prospect360Modal({
  prospectId,
  onClose,
}: {
  prospectId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProspectFiche360 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/prospects/${prospectId}/360`, { signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as ProspectFiche360 & { error?: string };
        if (!response.ok) throw new Error(json.error ?? "Chargement impossible");
        setData(json);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Chargement impossible");
      });
    return () => controller.abort();
  }, [prospectId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prospect = data?.prospect;

  return (
    <div className="modal-overlay">
      {/* Fond cliquable = vrai bouton (accessible au clavier), derrière la boîte. */}
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fiche 360 du client"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-head">
          <h3>
            {prospect === undefined
              ? "Fiche 360"
              : `${prospect.nom} ${prospect.prenom}`.trim() || prospect.email}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error !== null ? <p className="alert error">{error}</p> : null}
          {error === null && data === null ? <p className="hint">Chargement…</p> : null}

          {data !== null && prospect !== undefined ? (
            <>
              <section>
                <h4>Identité</h4>
                <dl className="kv">
                  <dt>Nom</dt>
                  <dd>{`${prospect.nom} ${prospect.prenom}`.trim() || "—"}</dd>
                  <dt>Nature</dt>
                  <dd>
                    {prospect.nature === "physique" ? "Personne physique" : "Personne morale"}
                  </dd>
                  <dt>Email</dt>
                  <dd>{prospect.email}</dd>
                  <dt>Origine</dt>
                  <dd>
                    {prospect.origine === "libre"
                      ? prospect.lienLabel === null || prospect.lienLabel === ""
                        ? "Libre (lien de chat)"
                        : `Libre — via « ${prospect.lienLabel} »`
                      : "Saisie manuelle"}
                  </dd>
                  {prospect.activite !== "" ? (
                    <>
                      <dt>Activité</dt>
                      <dd>{prospect.activite}</dd>
                    </>
                  ) : null}
                  {prospect.fonction !== "" ? (
                    <>
                      <dt>Fonction</dt>
                      <dd>{prospect.fonction}</dd>
                    </>
                  ) : null}
                  {prospect.detail !== "" ? (
                    <>
                      <dt>Autre détail</dt>
                      <dd>{prospect.detail}</dd>
                    </>
                  ) : null}
                </dl>
              </section>

              <section>
                <h4>Contacts ({data.contacts.length})</h4>
                <ul className="contact-list">
                  {data.contacts.map((contact) => (
                    <li key={`${contact.type}-${contact.valeur}`}>
                      <span className="badge muted">{contact.type}</span>
                      <span>{contact.valeur}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4>Conversations ({data.conversations.length})</h4>
                {data.conversations.length === 0 ? (
                  <p className="hint">Aucune conversation.</p>
                ) : (
                  <ul className="contact-list">
                    {data.conversations.map((conversation) => (
                      <li key={conversation.id}>
                        <a className="link muted-text" href={`/conversations/${conversation.id}`}>
                          {formatDate(conversation.createdAt)}
                        </a>
                        <span>
                          {conversation.contacts.length === 0
                            ? "—"
                            : conversation.contacts
                                .map((entry) => `${entry.type} : ${entry.valeur}`)
                                .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4>Fiches de prospection ({data.fiches.length})</h4>
                {data.fiches.length === 0 ? (
                  <p className="hint">Aucune fiche.</p>
                ) : (
                  <ul className="contact-list">
                    {data.fiches.map((fiche) => (
                      <li key={fiche.id}>
                        <span>
                          <strong>{fiche.plateformes.join(", ")}</strong> · {fiche.budget} ·{" "}
                          {fiche.duree}
                        </span>
                        <span className="muted-text">
                          {fiche.statut === "initier" ? "à initier" : "à reprendre"} ·{" "}
                          {formatDate(fiche.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
