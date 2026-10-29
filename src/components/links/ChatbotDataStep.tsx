"use client";

import { useState } from "react";
import type { ChatbotDataSelection as ChatbotDataSelectionValue } from "@/domain/entities/chatbot-config";
import { ChatbotDataSelection } from "./ChatbotDataSelection";
import type {
  ChatbotDataDraft,
  ConnaissanceDraftInput,
  LienDraftInput,
} from "./chatbot-data-draft";
import {
  chatbotDataDraftCount,
  nextDraftId,
  validateConnaissanceDraft,
  validateLienDraft,
  validatePhotoDraft,
} from "./chatbot-data-draft";

const CONNAISSANCE_FORM: ConnaissanceDraftInput = { titre: "", contenu: "" };
const LIEN_FORM: LienDraftInput = { libelle: "", url: "", description: "" };
type PhotoForm = { fichier: File | null; libelle: string; description: string };
const PHOTO_FORM: PhotoForm = { fichier: null, libelle: "", description: "" };

/**
 * Étape « Données » : sélection des données existantes (globales en lecture
 * seule) et ajouts en brouillon rattachés au chatbot après sa création.
 */
export function ChatbotDataStep({
  value,
  onChange,
  selection,
  onSelectionChange,
  onGlobalCountsChange,
  chatLinkId,
  onUploadPhoto,
  onRemovePhoto,
}: {
  value: ChatbotDataDraft;
  onChange: (next: ChatbotDataDraft) => void;
  selection: ChatbotDataSelectionValue;
  onSelectionChange: (next: ChatbotDataSelectionValue) => void;
  onGlobalCountsChange?: (counts: { connaissances: number; photos: number; liens: number }) => void;
  chatLinkId?: string | null;
  /**
   * Import immédiat d'une photo comme média temporaire (brouillon). Fourni par
   * le wizard : la photo survit ainsi à la fermeture/reprise du brouillon.
   */
  onUploadPhoto?: (input: {
    fichier: File;
    libelle: string;
    description: string;
  }) => Promise<{ mediaId: string }>;
  /** Suppression du média temporaire quand la photo est retirée du brouillon. */
  onRemovePhoto?: (photo: { mediaId?: string }) => void;
}) {
  const [mode, setMode] = useState<"none" | "connaissance" | "lien" | "photo">("none");
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [connaissance, setConnaissance] = useState<ConnaissanceDraftInput>(CONNAISSANCE_FORM);
  const [lien, setLien] = useState<LienDraftInput>(LIEN_FORM);
  const [photo, setPhoto] = useState<PhotoForm>(PHOTO_FORM);

  const resetForms = (): void => {
    setConnaissance(CONNAISSANCE_FORM);
    setLien(LIEN_FORM);
    setPhoto(PHOTO_FORM);
    setFormError(null);
    setMode("none");
  };

  const addConnaissance = (): void => {
    const error = validateConnaissanceDraft(connaissance);
    if (error !== null) {
      setFormError(error);
      return;
    }
    onChange({
      ...value,
      connaissances: [
        ...value.connaissances,
        {
          id: nextDraftId(),
          titre: connaissance.titre.trim(),
          contenu: connaissance.contenu.trim(),
        },
      ],
    });
    resetForms();
  };

  const addLien = (): void => {
    const error = validateLienDraft(lien);
    if (error !== null) {
      setFormError(error);
      return;
    }
    onChange({
      ...value,
      liens: [
        ...value.liens,
        {
          id: nextDraftId(),
          libelle: lien.libelle.trim(),
          url: lien.url.trim(),
          description: lien.description.trim(),
        },
      ],
    });
    resetForms();
  };

  const addPhoto = async (): Promise<void> => {
    if (photo.fichier === null) {
      setFormError("Choisissez un fichier image.");
      return;
    }
    const fichier = photo.fichier;
    const libelle = photo.libelle.trim();
    const description = photo.description.trim();
    const error = validatePhotoDraft({ fichier, libelle, description });
    if (error !== null) {
      setFormError(error);
      return;
    }
    if (onUploadPhoto !== undefined) {
      setUploading(true);
      setFormError(null);
      try {
        const { mediaId } = await onUploadPhoto({ fichier, libelle, description });
        onChange({
          ...value,
          photos: [...value.photos, { id: nextDraftId(), libelle, description, mediaId }],
        });
        resetForms();
      } catch (uploadError) {
        setFormError(
          uploadError instanceof Error ? uploadError.message : "Import de la photo impossible.",
        );
      } finally {
        setUploading(false);
      }
      return;
    }
    onChange({
      ...value,
      photos: [...value.photos, { id: nextDraftId(), libelle, description, fichier }],
    });
    resetForms();
  };

  const removeDraft = (kind: "connaissances" | "liens" | "photos", id: string): void => {
    if (kind === "photos") {
      const removed = value.photos.find((item) => item.id === id);
      if (removed !== undefined) onRemovePhoto?.(removed);
    }
    onChange({ ...value, [kind]: value[kind].filter((item) => item.id !== id) });
  };

  const total = chatbotDataDraftCount(value);

  return (
    <section className="chatbot-data-step">
      <div className="chatbot-data-globals">
        <div className="chatbot-step-head">
          <h4>Données existantes</h4>
          <p className="hint">
            Lecture seule : sélectionnez les données globales accessibles à ce chatbot. Leur portée
            n’est jamais modifiée. Utilisez « Gérer les données » pour les éditer.
          </p>
        </div>

        <ChatbotDataSelection
          selection={selection}
          onChange={onSelectionChange}
          chatLinkId={chatLinkId}
          onCountsChange={onGlobalCountsChange}
        />

        <div className="tools">
          <a className="btn ghost small" href="/connaissances" target="_blank" rel="noreferrer">
            Gérer les connaissances
          </a>
          <a className="btn ghost small" href="/medias" target="_blank" rel="noreferrer">
            Gérer les médias
          </a>
        </div>
      </div>

      <div className="chatbot-step-head">
        <h4>Ajouts pour ce chatbot ({total})</h4>
        <p className="hint">
          Ces ajouts seront rattachés au chatbot en cours de création. Ils ne modifient pas les
          données globales.
        </p>
      </div>

      <div className="tools">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setMode(mode === "connaissance" ? "none" : "connaissance")}
        >
          + Connaissance
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setMode(mode === "lien" ? "none" : "lien")}
        >
          + Lien média
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setMode(mode === "photo" ? "none" : "photo")}
        >
          + Photo
        </button>
      </div>

      {formError !== null ? <p className="alert error">{formError}</p> : null}

      {mode === "connaissance" ? (
        <div className="chatbot-data-form">
          <label className="field">
            Titre *
            <input
              type="text"
              maxLength={120}
              required
              value={connaissance.titre}
              onChange={(event) => setConnaissance({ ...connaissance, titre: event.target.value })}
            />
          </label>
          <label className="field">
            Contenu *
            <textarea
              rows={3}
              required
              value={connaissance.contenu}
              onChange={(event) =>
                setConnaissance({ ...connaissance, contenu: event.target.value })
              }
            />
          </label>
          <div className="tools">
            <button type="button" className="btn small" onClick={addConnaissance}>
              Ajouter
            </button>
            <button type="button" className="btn ghost small" onClick={resetForms}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {mode === "lien" ? (
        <div className="chatbot-data-form">
          <div className="grid-2">
            <label className="field">
              Libellé *
              <input
                type="text"
                maxLength={120}
                required
                value={lien.libelle}
                onChange={(event) => setLien({ ...lien, libelle: event.target.value })}
              />
            </label>
            <label className="field">
              URL *
              <input
                type="url"
                required
                placeholder="https://…"
                value={lien.url}
                onChange={(event) => setLien({ ...lien, url: event.target.value })}
              />
            </label>
          </div>
          <label className="field">
            Description
            <textarea
              rows={2}
              value={lien.description}
              onChange={(event) => setLien({ ...lien, description: event.target.value })}
            />
          </label>
          <div className="tools">
            <button type="button" className="btn small" onClick={addLien}>
              Ajouter
            </button>
            <button type="button" className="btn ghost small" onClick={resetForms}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {mode === "photo" ? (
        <div className="chatbot-data-form">
          <label className="field">
            Fichier image *
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={(event) => setPhoto({ ...photo, fichier: event.target.files?.[0] ?? null })}
            />
          </label>
          <label className="field">
            Libellé *
            <input
              type="text"
              maxLength={120}
              required
              value={photo.libelle}
              onChange={(event) => setPhoto({ ...photo, libelle: event.target.value })}
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={2}
              value={photo.description}
              onChange={(event) => setPhoto({ ...photo, description: event.target.value })}
            />
          </label>
          <div className="tools">
            <button
              type="button"
              className="btn small"
              disabled={uploading}
              onClick={() => void addPhoto()}
            >
              {uploading ? "Import…" : "Ajouter"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={uploading}
              onClick={resetForms}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <p className="hint">
          Aucune donnée ajoutée pour ce chatbot : il utilisera les données globales.
        </p>
      ) : (
        <ul className="chatbot-data-drafts">
          {value.connaissances.map((item) => (
            <li key={item.id}>
              <span>
                <strong>Connaissance</strong> · {item.titre}
              </span>
              <button
                type="button"
                className="btn danger ghost small"
                onClick={() => removeDraft("connaissances", item.id)}
              >
                Retirer
              </button>
            </li>
          ))}
          {value.liens.map((item) => (
            <li key={item.id}>
              <span>
                <strong>Lien</strong> · {item.libelle}
              </span>
              <button
                type="button"
                className="btn danger ghost small"
                onClick={() => removeDraft("liens", item.id)}
              >
                Retirer
              </button>
            </li>
          ))}
          {value.photos.map((item) => (
            <li key={item.id}>
              <span>
                <strong>Photo</strong> · {item.libelle}
              </span>
              <button
                type="button"
                className="btn danger ghost small"
                onClick={() => removeDraft("photos", item.id)}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
