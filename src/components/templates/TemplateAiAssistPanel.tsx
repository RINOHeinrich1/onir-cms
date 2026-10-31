"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { TemplateAiGenerationDto, TemplateAiModelsDto } from "./ai-types";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.odt,.md,.markdown,.rtf,.txt";

export function TemplateAiAssistPanel({
  templateKey,
  onGenerated,
  endpoint = "/api/templates/ai/generate",
}: {
  templateKey: string | null;
  onGenerated: (result: TemplateAiGenerationDto) => void;
  endpoint?: string;
}) {
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [maxPages, setMaxPages] = useState("5");
  const [maxDepth, setMaxDepth] = useState("1");
  const [showCrawl, setShowCrawl] = useState(false);
  const [consent, setConsent] = useState(false);
  const [catalog, setCatalog] = useState<TemplateAiModelsDto | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useToastOnMessage(error, notice);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/templates/ai/models", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as TemplateAiModelsDto & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setCatalogError(json.error ?? "Modèles IA indisponibles.");
          return;
        }
        setCatalog(json);
        const preferredProvider =
          json.providers.find((provider) => provider.id === json.defaultProviderId) ??
          json.providers[0];
        if (preferredProvider !== undefined) {
          setProviderId(preferredProvider.id);
          const preferredModel = preferredProvider.models.find(
            (entry) => entry.modelId === json.defaultModel,
          );
          setModel(preferredModel?.modelId ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogError("Modèles IA indisponibles.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pending) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  const selectedProvider = useMemo(
    () => catalog?.providers.find((provider) => provider.id === providerId) ?? null,
    [catalog, providerId],
  );
  const hasModels = (catalog?.providers.length ?? 0) > 0;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const onProviderChange = (nextProviderId: string): void => {
    setProviderId(nextProviderId);
    const nextProvider = catalog?.providers.find((provider) => provider.id === nextProviderId);
    const preferredModel = nextProvider?.models.find(
      (entry) => entry.modelId === catalog?.defaultModel,
    );
    setModel(preferredModel?.modelId ?? "");
  };

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Array.from(event.target.files ?? []);
    setError(null);
    if (next.length > MAX_FILES) {
      setError(`Trop de fichiers : ${MAX_FILES} maximum.`);
      event.target.value = "";
      return;
    }
    const tooLarge = next.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge !== undefined) {
      setError(`Le fichier « ${tooLarge.name} » dépasse 10 Mo.`);
      event.target.value = "";
      return;
    }
    setFiles(next);
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    if (!consent) {
      setError("Confirmez l'envoi des sources au fournisseur IA.");
      return;
    }
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("description", description);
      formData.set("websiteUrl", websiteUrl);
      formData.set("maxPages", maxPages);
      formData.set("maxDepth", maxDepth);
      if (providerId !== "") formData.set("providerId", providerId);
      if (model !== "") formData.set("model", model);
      if (templateKey !== null) formData.set("templateKey", templateKey);
      for (const file of files) formData.append("files", file);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as TemplateAiGenerationDto & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Génération impossible");
        return;
      }
      onGenerated(json);
      setNotice(
        `Brouillon généré avec ${json.providerLabel} · ${json.model}. Vérifiez-le avant d'enregistrer.`,
      );
    } catch {
      setError("Erreur réseau pendant la génération.");
    } finally {
      setPending(false);
    }
  };

  if (catalogError !== null) return <p className="alert error">{catalogError}</p>;
  if (catalog === null) return <p className="hint">Chargement des modèles IA…</p>;
  if (!hasModels) {
    return (
      <p className="alert warning">
        Aucun modèle IA actif n'est disponible. Configurez un fournisseur et activez au moins un
        modèle dans <a href="/parametres/ia">Paramètres → Fournisseurs IA</a>.
      </p>
    );
  }

  return (
    <div className="template-ai-panel" aria-busy={pending}>
      <div className="template-ai-head">
        <div>
          <strong>Décrivez le chatbot, l'IA prépare le modèle.</strong>
          <p className="hint">
            L'IA analyse la description, le site et les documents, puis remplit le modèle. Vous
            relisez et validez avant l'enregistrement.
          </p>
        </div>
        <span className="pill">{catalog.providers.length} fournisseur(s)</span>
      </div>

      <label className="field">
        Description du chatbot *
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ex. : assistant de qualification pour une entreprise de rénovation ; il doit comprendre le projet, la surface, le budget et le délai."
          disabled={pending}
          required
        />
      </label>

      <label className="field">
        Lien du site (optionnel)
        <input
          type="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://exemple.fr"
          disabled={pending}
        />
        <span className="hint">Le site est analysé sans exécuter JavaScript.</span>
      </label>

      <label className="field">
        Documents (optionnel)
        <input type="file" accept={ACCEPT} multiple onChange={onFilesChange} disabled={pending} />
        <span className="hint">
          PDF, DOCX, ODT, Markdown, RTF ou TXT · {MAX_FILES} fichiers max · 10 Mo par fichier.
        </span>
      </label>
      {files.length > 0 ? (
        <ul className="template-ai-files">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>
              <span>{file.name}</span>
              <span className="muted-text">{Math.round(file.size / 1024)} Ko</span>
            </li>
          ))}
        </ul>
      ) : null}
      {totalBytes > 0 ? (
        <p className="hint">Total : {Math.round(totalBytes / 1024 / 1024)} Mo</p>
      ) : null}

      <div className="grid-2">
        <label className="field">
          Fournisseur IA
          <select
            value={providerId}
            onChange={(event) => onProviderChange(event.target.value)}
            disabled={pending}
          >
            {catalog.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Modèle IA
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={pending}
          >
            <option value="">— Choisir un modèle —</option>
            {selectedProvider?.models.map((entry) => (
              <option key={entry.modelId} value={entry.modelId}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        className="btn ghost small"
        onClick={() => setShowCrawl((value) => !value)}
      >
        {showCrawl ? "Masquer" : "Ajuster"} le crawl du site
      </button>
      {showCrawl ? (
        <div className="grid-2 template-ai-crawl">
          <label className="field">
            Pages maximum (1–10)
            <input
              type="number"
              min={1}
              max={10}
              value={maxPages}
              onChange={(event) => setMaxPages(event.target.value)}
            />
          </label>
          <label className="field">
            Profondeur (0–2)
            <input
              type="number"
              min={0}
              max={2}
              value={maxDepth}
              onChange={(event) => setMaxDepth(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      <label className="check template-ai-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={pending}
        />{" "}
        J'accepte que la description, les pages du site et les documents soient envoyés au
        fournisseur IA sélectionné pour générer le modèle.
      </label>

      <div className="tools">
        <button
          type="button"
          className="btn small"
          onClick={() => void generate()}
          disabled={pending || !hasModels || model === ""}
        >
          {pending ? "Génération en cours…" : "Générer le modèle"}
        </button>
        <span className="hint">Aucune donnée n'est écrite avant votre validation.</span>
      </div>

      {pending ? (
        <div className="template-ai-progress" role="status" aria-live="polite">
          <span className="template-ai-spinner" aria-hidden="true" />
          <div>
            <strong>Préparation du modèle…</strong>
            <p>
              Lecture des documents, analyse du site si fourni, puis génération IA. Cela peut
              prendre jusqu'à deux minutes.
            </p>
            <span className="hint">{elapsed} s</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
