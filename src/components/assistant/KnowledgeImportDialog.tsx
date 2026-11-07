"use client";

import { useEffect, useRef, useState } from "react";
import type { ExtractedKnowledge } from "@/application/use-cases/connaissances/extract-knowledge-from-sources";
import type { ConnaissanceConflict } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import { ConnaissanceConflictModal } from "@/components/links/ConnaissanceConflictModal";
import { checkConnaissanceConflicts } from "@/components/links/chatbot-data-draft";
import { Modal } from "@/components/ui/Modal";

type ScopeChatbot = { id: string; label: string };
type Candidate = ExtractedKnowledge["items"][number] & { localId: string };
type ImportResult = { created: number; updated: number; skipped: number; failures: string[] };

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("fr");
}

export function KnowledgeImportDialog({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [scopeOptions, setScopeOptions] = useState<ScopeChatbot[]>([]);
  const [scopeQuery, setScopeQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourceSummary, setSourceSummary] = useState<ExtractedKnowledge["sources"] | null>(null);
  const [conflicts, setConflicts] = useState<ConnaissanceConflict[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"sources" | "preview" | "done">("sources");
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/connaissances/scope-options")
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as {
          chatbots?: ScopeChatbot[];
          error?: string;
        };
        if (!response.ok) throw new Error(json.error ?? "Chargement des chatbots impossible");
        if (!cancelled) setScopeOptions(json.chatbots ?? []);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Chargement des chatbots impossible");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedLabels = selectedScope
    .map((id) => scopeOptions.find((chatbot) => chatbot.id === id)?.label ?? id)
    .filter((label) => label !== "");
  const suggestions = scopeOptions
    .filter((chatbot) => !selectedScope.includes(chatbot.id))
    .filter((chatbot) => normalized(chatbot.label).includes(normalized(scopeQuery)))
    .slice(0, 6);

  const addScope = (id: string) => {
    setSelectedScope((current) => (current.includes(id) ? current : [...current, id]));
    setScopeQuery("");
  };

  const removeScope = (id: string) => {
    setSelectedScope((current) => current.filter((entry) => entry !== id));
  };

  const addUrl = () => {
    const value = urlInput.trim();
    if (value === "") return;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      setUrls((current) =>
        current.includes(url.toString()) ? current : [...current, url.toString()],
      );
      setUrlInput("");
    } catch {
      setError("Le lien doit être une URL http(s) valide");
    }
  };

  const addFiles = (selected: FileList | null) => {
    if (selected === null) return;
    const next = Array.from(selected);
    setFiles((current) => [...current, ...next].slice(0, 5));
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
  };

  const analyze = async (): Promise<void> => {
    if (files.length === 0 && urls.length === 0) {
      setError("Ajoutez au moins un document ou un lien");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      formData.append("urls", JSON.stringify(urls));
      const response = await fetch("/api/connaissances/ai/extract", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json().catch(() => ({}))) as ExtractedKnowledge & {
        error?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Extraction impossible");
      setCandidates(
        json.items.map((item, index) => ({
          ...item,
          localId: `import-${Date.now()}-${index}`,
        })),
      );
      setWarnings(json.warnings);
      setSourceSummary(json.sources);
      setStep("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Extraction impossible");
    } finally {
      setExtracting(false);
    }
  };

  const updateCandidate = (index: number, patch: Partial<Candidate>) => {
    setCandidates((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const removeCandidate = (index: number) => {
    setCandidates((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  };

  const applyImport = async (conflictAction?: "update" | "keep"): Promise<void> => {
    if (candidates.length === 0) {
      setError("Aucune connaissance à importer");
      return;
    }
    const invalid = candidates.find(
      (candidate) => candidate.titre.trim() === "" || candidate.contenu.trim() === "",
    );
    if (invalid !== undefined) {
      setError("Chaque connaissance doit avoir un titre et un contenu");
      return;
    }
    if (conflictAction === undefined) {
      try {
        const found = await checkConnaissanceConflicts(candidates);
        if (found.length > 0) {
          setConflicts(found);
          return;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Vérification des doublons impossible");
        return;
      }
    }

    setImporting(true);
    setError(null);
    const conflictByTitle = new Map(
      (conflicts ?? []).map((conflict) => [normalized(conflict.titre), conflict]),
    );
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const candidate of candidates) {
      const conflict = conflictByTitle.get(normalized(candidate.titre));
      if (conflict !== undefined && conflictAction === "keep") {
        skipped += 1;
        continue;
      }
      try {
        if (conflict !== undefined && conflictAction === "update") {
          const scope =
            conflict.existingChatLinkIds.length === 0
              ? undefined
              : selectedScope.length === 0
                ? undefined
                : [...new Set([...conflict.existingChatLinkIds, ...selectedScope])];
          const response = await fetch(`/api/connaissances/${conflict.existingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contenu: candidate.contenu.trim(),
              ...(scope === undefined ? {} : { chatLinkIds: scope }),
            }),
          });
          if (!response.ok) {
            const json = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(json.error ?? "Mise à jour impossible");
          }
          updated += 1;
          continue;
        }

        const response = await fetch("/api/connaissances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titre: candidate.titre.trim(),
            contenu: candidate.contenu.trim(),
            actif: true,
            chatLinkIds: selectedScope,
          }),
        });
        if (!response.ok) {
          const json = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "Création impossible");
        }
        created += 1;
      } catch (cause) {
        failures.push(
          `${candidate.titre.trim()} : ${cause instanceof Error ? cause.message : "échec"}`,
        );
      }
    }

    setResult({ created, updated, skipped, failures });
    setConflicts(null);
    setStep("done");
    setImporting(false);
  };

  return (
    <>
      <Modal
        title="Remplir des connaissances"
        onClose={onClose}
        wide
        dialogClassName="knowledge-import-modal"
        bodyClassName="knowledge-import-body"
      >
        {step === "sources" ? (
          <div className="knowledge-import-form">
            <p className="hint">
              Importez des documents ou des pages web. L’IA extrait les informations, vous les
              relisez avant l’enregistrement.
            </p>

            <section className="knowledge-import-section">
              <h4>Documents</h4>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.odt,.md,.rtf,.txt"
                className="sr-only"
                onChange={(event) => addFiles(event.target.files)}
                aria-label="Ajouter des documents"
              />
              <button
                type="button"
                className="btn small"
                onClick={() => fileInputRef.current?.click()}
              >
                Ajouter des documents
              </button>
              {files.length > 0 ? (
                <ul className="knowledge-import-chips">
                  {files.map((file) => (
                    <li key={file.name}>
                      {file.name}
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((current) => current.filter((item) => item !== file))
                        }
                        aria-label={`Retirer ${file.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="knowledge-import-section">
              <h4>Liens de sites</h4>
              <div className="knowledge-import-inline">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addUrl();
                    }
                  }}
                  placeholder="https://exemple.com"
                  aria-label="Lien de site à analyser"
                />
                <button type="button" className="btn small" onClick={addUrl}>
                  Ajouter
                </button>
              </div>
              {urls.length > 0 ? (
                <ul className="knowledge-import-chips">
                  {urls.map((url) => (
                    <li key={url}>
                      {url}
                      <button
                        type="button"
                        onClick={() => setUrls((current) => current.filter((item) => item !== url))}
                        aria-label={`Retirer ${url}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="knowledge-import-section">
              <h4>Scope des connaissances</h4>
              <div className="knowledge-import-tags">
                {selectedLabels.map((label) => (
                  <span key={label} className="knowledge-import-tag">
                    {label}
                    <button
                      type="button"
                      onClick={() => {
                        const option = scopeOptions.find((chatbot) => chatbot.label === label);
                        if (option !== undefined) removeScope(option.id);
                      }}
                      aria-label={`Retirer ${label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={scopeQuery}
                  onChange={(event) => setScopeQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && suggestions[0] !== undefined) {
                      event.preventDefault();
                      addScope(suggestions[0].id);
                    }
                    if (
                      event.key === "Backspace" &&
                      scopeQuery === "" &&
                      selectedScope.length > 0
                    ) {
                      removeScope(selectedScope[selectedScope.length - 1] ?? "");
                    }
                  }}
                  placeholder={
                    selectedScope.length === 0
                      ? "Globale — rechercher un chatbot"
                      : "Ajouter un chatbot"
                  }
                  aria-label="Rechercher un chatbot pour le scope"
                />
              </div>
              {suggestions.length > 0 ? (
                <div className="knowledge-import-suggestions">
                  {suggestions.map((chatbot) => (
                    <button key={chatbot.id} type="button" onClick={() => addScope(chatbot.id)}>
                      {chatbot.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="hint">
                {selectedScope.length === 0
                  ? "Aucun chatbot sélectionné : les connaissances seront globales."
                  : "Les connaissances seront limitées aux chatbots sélectionnés."}
              </p>
            </section>

            {error === null ? null : (
              <p className="chatbot-builder-error" role="alert">
                {error}
              </p>
            )}
            <div className="knowledge-import-actions">
              <button
                type="button"
                className="btn"
                disabled={extracting}
                onClick={() => void analyze()}
              >
                {extracting ? "Analyse en cours…" : "Analyser avec l’IA"}
              </button>
              <button type="button" className="btn ghost" onClick={onClose} disabled={extracting}>
                Annuler
              </button>
            </div>
          </div>
        ) : step === "preview" ? (
          <div className="knowledge-import-form">
            <div className="knowledge-import-preview-head">
              <div>
                <h3>{candidates.length} connaissance(s) extraite(s)</h3>
                <p className="hint">
                  {sourceSummary === null
                    ? ""
                    : `${sourceSummary.pages.length} page(s), ${sourceSummary.files.length} document(s), ${sourceSummary.chars.toLocaleString("fr-FR")} caractères.`}
                </p>
              </div>
              <span className="knowledge-import-scope-summary">
                {selectedScope.length === 0 ? "Global" : `${selectedScope.length} chatbot(s)`}
              </span>
            </div>

            {warnings.length > 0 ? (
              <div className="chatbot-builder-warnings">
                <strong>Avertissements</strong>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="knowledge-import-preview-list">
              {candidates.map((candidate, index) => (
                <article key={candidate.localId} className="knowledge-import-preview-item">
                  <div className="knowledge-import-preview-row">
                    <input
                      value={candidate.titre}
                      onChange={(event) => updateCandidate(index, { titre: event.target.value })}
                      aria-label={`Titre de la connaissance ${index + 1}`}
                      maxLength={120}
                    />
                    <button
                      type="button"
                      className="chatbot-builder-icon-btn"
                      onClick={() => removeCandidate(index)}
                      aria-label={`Retirer ${candidate.titre}`}
                      title="Retirer"
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={candidate.contenu}
                    onChange={(event) => updateCandidate(index, { contenu: event.target.value })}
                    aria-label={`Contenu de la connaissance ${index + 1}`}
                  />
                </article>
              ))}
            </div>

            {error === null ? null : (
              <p className="chatbot-builder-error" role="alert">
                {error}
              </p>
            )}
            <div className="knowledge-import-actions">
              <button
                type="button"
                className="btn subtle"
                onClick={() => setStep("sources")}
                disabled={importing}
              >
                Retour aux sources
              </button>
              <button
                type="button"
                className="btn"
                disabled={importing || candidates.length === 0}
                onClick={() => void applyImport()}
              >
                {importing ? "Import en cours…" : "Importer les connaissances"}
              </button>
            </div>
          </div>
        ) : (
          <div className="knowledge-import-done">
            <h3>Import terminé</h3>
            <p>
              {result?.created ?? 0} créée(s), {result?.updated ?? 0} mise(s) à jour,{" "}
              {result?.skipped ?? 0} ignorée(s).
            </p>
            {result !== null && result.failures.length > 0 ? (
              <div className="chatbot-builder-warnings">
                <strong>Échecs</strong>
                <ul>
                  {result.failures.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="knowledge-import-actions">
              <button type="button" className="btn" onClick={onClose}>
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>
      {conflicts === null ? null : (
        <ConnaissanceConflictModal
          conflicts={conflicts}
          onClose={() => setConflicts(null)}
          onResolve={(action) => {
            setConflicts(null);
            void applyImport(action);
          }}
        />
      )}
    </>
  );
}
