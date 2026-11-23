"use client";

import { useCallback, useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";

type PublicEmailSettings = {
  source: "organization" | "platform";
  organizationId: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  status: "active" | "disabled";
  passwordConfigured: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string;
};

type FormState = {
  host: string;
  port: string;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  status: "active" | "disabled";
};

function formFrom(settings: PublicEmailSettings | null): FormState {
  return {
    host: settings?.host ?? "",
    port: String(settings?.port ?? 587),
    // 587 = submission STARTTLS ; le TLS implicite est réservé à 465.
    secure: settings?.secure ?? false,
    username: settings?.username ?? "",
    password: "",
    fromEmail: settings?.fromEmail ?? "",
    fromName: settings?.fromName ?? "",
    replyTo: settings?.replyTo ?? "",
    status: settings?.status ?? "active",
  };
}

export function EmailSettingsPanel({
  scope,
  title,
  description,
  canEdit,
}: {
  scope: "organization" | "platform";
  title: string;
  description: string;
  canEdit: boolean;
}) {
  const endpoint =
    scope === "platform" ? "/api/platform/email-settings" : "/api/organization/email-settings";
  const [settings, setSettings] = useState<PublicEmailSettings | null>(null);
  const [form, setForm] = useState<FormState>(formFrom(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const json = (await response.json()) as {
        settings?: PublicEmailSettings | null;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Impossible de charger la configuration email");
        return;
      }
      setSettings(json.settings ?? null);
      setForm(formFrom(json.settings ?? null));
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(next: Partial<FormState>): void {
    setForm((current) => ({ ...current, ...next }));
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: Number(form.port) }),
      });
      const json = (await response.json()) as { settings?: PublicEmailSettings; error?: string };
      if (!response.ok || json.settings === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      setSettings(json.settings);
      setForm(formFrom(json.settings));
      toast.success("Configuration email enregistrée");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setSaving(false);
    }
  }

  async function test(): Promise<void> {
    setTesting(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/test`, { method: "POST" });
      const json = (await response.json()) as { error?: string; to?: string };
      if (!response.ok) {
        setError(json.error ?? "Test SMTP impossible");
        return;
      }
      toast.success(`Email de test envoyé à ${json.to ?? "votre adresse"}`);
      await load();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="hint">Chargement de la configuration email…</p>;

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        </div>
        <span className={`badge ${settings?.status === "active" ? "success" : "muted"}`}>
          {settings === null
            ? "Non configuré"
            : settings.status === "active"
              ? "Actif"
              : "Désactivé"}
        </span>
      </div>

      {scope === "organization" && settings === null ? (
        <p className="hint mt-3">
          Aucun SMTP d’organisation : le SMTP par défaut de la plateforme sera utilisé pour l’OTP.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="field">
          Hôte SMTP
          <input
            className="input"
            value={form.host}
            onChange={(e) => patch({ host: e.target.value })}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          Port
          <input
            className="input"
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => {
              const value = e.target.value;
              patch({
                port: value,
                ...(value === "465" ? { secure: true } : value === "587" ? { secure: false } : {}),
              });
            }}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          Utilisateur
          <input
            className="input"
            value={form.username}
            onChange={(e) => patch({ username: e.target.value })}
            disabled={!canEdit}
            autoComplete="username"
          />
        </label>
        <label className="field" htmlFor="smtp-password">
          Mot de passe
          <PasswordInput
            id="smtp-password"
            className="input"
            value={form.password}
            onChange={(e) => patch({ password: e.target.value })}
            disabled={!canEdit}
            autoComplete="new-password"
            placeholder={
              settings?.passwordConfigured ? "Laisser vide pour conserver" : "Mot de passe SMTP"
            }
          />
        </label>
        <label className="field">
          Expéditeur (email)
          <input
            className="input"
            type="email"
            value={form.fromEmail}
            onChange={(e) => patch({ fromEmail: e.target.value })}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          Nom expéditeur
          <input
            className="input"
            value={form.fromName}
            onChange={(e) => patch({ fromName: e.target.value })}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          Répondre à
          <input
            className="input"
            type="email"
            value={form.replyTo}
            onChange={(e) => patch({ replyTo: e.target.value })}
            disabled={!canEdit}
          />
        </label>
        <label className="field">
          Statut
          <select
            className="input"
            value={form.status}
            onChange={(e) =>
              patch({ status: e.target.value === "disabled" ? "disabled" : "active" })
            }
            disabled={!canEdit}
          >
            <option value="active">Actif</option>
            <option value="disabled">Désactivé</option>
          </select>
        </label>
      </div>
      <label className="check mt-3">
        <input
          type="checkbox"
          checked={form.secure}
          onChange={(e) => patch({ secure: e.target.checked })}
          disabled={!canEdit}
        />{" "}
        TLS implicite (généralement port 465 ; laisser décoché pour 587/STARTTLS)
      </label>

      {settings?.lastTestedAt ? (
        <p className={`hint mt-3 ${settings.lastTestOk === false ? "text-danger" : ""}`}>
          Dernier test : {new Date(settings.lastTestedAt).toLocaleString("fr-FR")} —{" "}
          {settings.lastTestOk ? "OK" : (settings.lastTestError ?? "échec")}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void test()}
            disabled={testing || settings === null}
          >
            {testing ? "Test…" : "Envoyer un test"}
          </button>
        </div>
      ) : (
        <p className="hint mt-4">Lecture seule.</p>
      )}
    </section>
  );
}
