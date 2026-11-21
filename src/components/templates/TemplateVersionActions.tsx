"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VisualTemplateVersionUsage } from "@/application/ports/visual-template-repository";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

export function TemplateVersionActions({
  templateId,
  templateName,
  version,
  versionCount,
  isDisabled,
  healthStatus,
  usage,
  canManage,
}: {
  templateId: string;
  templateName: string;
  version: string;
  versionCount: number;
  isDisabled: boolean;
  healthStatus: "unknown" | "ok" | "error";
  usage: VisualTemplateVersionUsage;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"toggle" | "uninstall" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useToastOnMessage(error, message);

  if (!canManage) return null;

  const blockedReason =
    usage.links > 0
      ? `${usage.links} lien(s) utilise(nt) encore cette version.`
      : usage.bindings > 0
        ? `${usage.bindings} configuration(s) de données référence(nt) cette version.`
        : versionCount <= 1
          ? "Impossible de désinstaller la dernière version du template."
          : !isDisabled && healthStatus !== "error"
            ? "Désactivez d’abord cette version avant de la désinstaller."
            : null;

  const toggleDisabled = async (): Promise<void> => {
    setPending("toggle");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/visual-templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disabled: !isDisabled }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      setMessage(isDisabled ? `Version ${version} réactivée.` : `Version ${version} désactivée.`);
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  const uninstall = async (): Promise<void> => {
    setPending("uninstall");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/visual-templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version)}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Désinstallation impossible");
        return;
      }
      setConfirming(false);
      setMessage(`Version ${version} désinstallée.`);
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn ghost small"
        disabled={pending !== null}
        onClick={() => void toggleDisabled()}
      >
        {pending === "toggle"
          ? "Traitement…"
          : isDisabled
            ? "Réactiver la version"
            : "Désactiver la version"}
      </button>
      <button
        type="button"
        className="btn danger ghost small"
        disabled={pending !== null || blockedReason !== null}
        title={blockedReason ?? undefined}
        onClick={() => {
          setError(null);
          setMessage(null);
          setConfirming(true);
        }}
      >
        Désinstaller la version
      </button>
      {blockedReason === null ? null : <p className="hint">{blockedReason}</p>}

      {confirming ? (
        <Modal
          title={`Désinstaller la version ${version} ?`}
          onClose={() => {
            if (pending !== "uninstall") setConfirming(false);
          }}
          dismissible={pending !== "uninstall"}
        >
          <p>
            La version <strong>{version}</strong> du template <strong>{templateName}</strong> et ses{" "}
            <strong>{usage.assets}</strong> fichier(s) seront supprimés définitivement.
          </p>
          <ul className="hint">
            <li>{usage.links} lien(s) concerné(s)</li>
            <li>{usage.bindings} configuration(s) de données concernée(s)</li>
          </ul>
          <p className="alert error">
            Cette action est irréversible. Les liens existants doivent déjà être revenus à une autre
            version.
          </p>
          {error === null ? null : <p className="alert error">{error}</p>}
          <div className="tools" style={{ marginTop: "1.25rem" }}>
            <button
              type="button"
              className="btn danger small"
              disabled={pending === "uninstall"}
              onClick={() => void uninstall()}
            >
              {pending === "uninstall" ? "Désinstallation…" : "Désinstaller définitivement"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={pending === "uninstall"}
              onClick={() => setConfirming(false)}
            >
              Annuler
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
