"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import { StudioIcon } from "./StudioIcon";
import { previewDimensions } from "./studio-utils";
import type { StudioDevice } from "./types";

type Props = {
  src: string;
  surface: ChatLinkSurface;
  device: StudioDevice;
  hasLink: boolean;
  hasTemplates: boolean;
  onDeviceChange: (device: StudioDevice) => void;
  onRefresh: () => void;
};

const DEVICES: { id: StudioDevice; label: string; icon: "monitor" | "tablet" | "smartphone" }[] = [
  { id: "desktop", label: "Bureau", icon: "monitor" },
  { id: "tablet", label: "Tablette", icon: "tablet" },
  { id: "mobile", label: "Mobile", icon: "smartphone" },
];

const ZOOM_OPTIONS = [50, 75, 100, 125, 150];

export function StudioPreview({
  src,
  surface,
  device,
  hasLink,
  hasTemplates,
  onDeviceChange,
  onRefresh,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomMode, setZoomMode] = useState<"fit" | "custom">("fit");
  const [customZoom, setCustomZoom] = useState(100);
  const [fitZoom, setFitZoom] = useState(0.6);
  const dimensions = previewDimensions(device);

  useEffect(() => {
    const node = canvasRef.current;
    if (node === null) return;

    const compute = (): void => {
      const padding = 72;
      const availableWidth = Math.max(240, node.clientWidth - padding);
      const availableHeight = Math.max(320, node.clientHeight - padding);
      const next = Math.min(
        1.25,
        availableWidth / dimensions.width,
        availableHeight / dimensions.height,
      );
      setFitZoom(Math.max(0.25, Math.round(next * 100) / 100));
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(node);
    return () => observer.disconnect();
  }, [dimensions.height, dimensions.width]);

  const zoom = zoomMode === "fit" ? fitZoom : customZoom / 100;
  const displayZoom = Math.round(zoom * 100);

  const fullscreen = (): void => {
    const node = canvasRef.current;
    if (node === null) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen?.();
  };

  return (
    <section className="studio-stage" aria-label="Aperçu du template">
      <div className="studio-stage-toolbar">
        <div className="studio-device-switch">
          {DEVICES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`studio-device-button${device === entry.id ? " is-active" : ""}`}
              title={entry.label}
              aria-pressed={device === entry.id}
              onClick={() => {
                setZoomMode("fit");
                onDeviceChange(entry.id);
              }}
            >
              <StudioIcon name={entry.icon} size={15} />
            </button>
          ))}
        </div>

        <span className="studio-stage-dimensions">
          <span className={`studio-surface-dot studio-surface-dot--${surface}`} />
          {dimensions.label}
        </span>

        <div className="studio-stage-actions">
          <label className="studio-zoom">
            <span>Zoom</span>
            <span className="studio-select-wrap">
              <select
                value={zoomMode === "fit" ? "fit" : String(customZoom)}
                onChange={(event) => {
                  if (event.target.value === "fit") {
                    setZoomMode("fit");
                    return;
                  }
                  setCustomZoom(Number(event.target.value));
                  setZoomMode("custom");
                }}
              >
                <option value="fit">Ajuster · {Math.round(fitZoom * 100)}%</option>
                {ZOOM_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
              <StudioIcon name="chevron" size={12} />
            </span>
          </label>
          <button
            type="button"
            className="studio-icon-button"
            title="Rafraîchir l’aperçu"
            onClick={onRefresh}
          >
            <StudioIcon name="refresh" />
          </button>
          <button
            type="button"
            className="studio-icon-button"
            title="Plein écran"
            onClick={fullscreen}
          >
            <StudioIcon name="maximize" />
          </button>
          {src === "" ? null : (
            <a
              className="studio-icon-button"
              href={src}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir dans un nouvel onglet"
            >
              <StudioIcon name="external" />
            </a>
          )}
        </div>
      </div>

      <div className="studio-canvas" ref={canvasRef}>
        {!hasLink ? (
          <div className="studio-empty studio-empty--canvas">
            <span className="studio-empty-icon">
              <StudioIcon name="link" size={24} />
            </span>
            <strong>Aucun chatbot à prévisualiser</strong>
            <p>Créez un chatbot pour lui rattacher un template et tester le rendu en direct.</p>
            <a className="btn small" href="/liens">
              Créer un chatbot
            </a>
          </div>
        ) : !hasTemplates ? (
          <div className="studio-empty studio-empty--canvas">
            <span className="studio-empty-icon">
              <StudioIcon name="layers" size={24} />
            </span>
            <strong>Aucun template installé</strong>
            <p>Importez un template visuel pour afficher un aperçu personnalisable.</p>
            <a className="btn small" href="/templates-visuels">
              Importer un template
            </a>
          </div>
        ) : src === "" ? (
          <div className="studio-empty studio-empty--canvas">
            <span className="studio-empty-icon">
              <StudioIcon name="eye" size={24} />
            </span>
            <strong>Sélectionnez un modèle</strong>
            <p>Choisissez un template dans la bibliothèque pour lancer l’aperçu.</p>
          </div>
        ) : (
          <div
            className={`studio-device studio-device--${device}`}
            style={{
              width: dimensions.width * zoom,
              height: dimensions.height * zoom,
            }}
          >
            <div
              className="studio-device-frame"
              style={{
                width: dimensions.width,
                height: dimensions.height,
                transform: `scale(${zoom})`,
              }}
            >
              <div className="studio-device-chrome" aria-hidden="true">
                <span className="studio-device-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="studio-device-address">
                  {surface === "widget" ? "site hôte · widget" : "aperçu du template"}
                </span>
                <span className="studio-device-zoom">{displayZoom}%</span>
              </div>
              <iframe
                key={src}
                className="studio-preview-frame"
                src={src}
                title="Aperçu du template personnalisé"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
