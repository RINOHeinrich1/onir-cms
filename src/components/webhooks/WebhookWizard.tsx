"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { WebhookAuth } from "@/domain/entities/webhook";
import {
  WEBHOOK_AUTH_TYPES,
  WEBHOOK_BODY_MODES,
  WEBHOOK_HTTP_METHODS,
  WEBHOOK_META_FIELD_LABELS,
  WEBHOOK_META_FIELDS,
  WEBHOOK_PROSPECT_FIELD_LABELS,
  WEBHOOK_PROSPECT_FIELDS,
} from "@/domain/entities/webhook";
import type { WebhookChatbotOption, WebhookEndpointAdminDto, WebhookFieldOption } from "./types";

type HeaderDraft = { uid: string; name: string; value: string; secret: boolean };
type MappingDraft = {
  source: WebhookFieldOption["source"];
  field: string;
  target: string;
  required: boolean;
  fileMode: string;
};
type AuthDraft = {
  type: string;
  token: string;
  username: string;
  password: string;
  headerName: string;
  key: string;
  paramName: string;
  secret: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
};
type ScopeDraft = { chatLinkId: string; ficheKey: string };
type Tab = "model" | "meta" | "prospect";

const STEPS = [
  { label: "Général", description: "Identité et périmètre" },
  { label: "Destination", description: "URL et requête HTTP" },
  { label: "Données", description: "Champs et correspondances" },
  { label: "Sécurité", description: "Authentification et fiabilité" },
  { label: "Vérification", description: "Récapitulatif final" },
] as const;

const METHOD_LABELS: Record<string, string> = {
  GET: "GET",
  HEAD: "HEAD",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
};

const BODY_LABELS: Record<string, string> = {
  json: "JSON",
  form_urlencoded: "Form URL encoded",
  multipart: "Multipart / fichiers",
  raw: "Texte ou XML brut",
};

const AUTH_LABELS: Record<string, string> = {
  none: "Aucune",
  bearer: "Bearer token",
  basic: "Basic auth",
  api_key_header: "Clé API dans un en-tête",
  api_key_query: "Clé API dans la query",
  hmac: "Signature HMAC",
  oauth2_client_credentials: "OAuth2 client credentials",
};

function authDraft(auth: WebhookAuth | null): AuthDraft {
  const base: AuthDraft = {
    type: auth?.type ?? "none",
    token: "",
    username: "",
    password: "",
    headerName: "",
    key: "",
    paramName: "",
    secret: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    scope: "",
  };
  if (auth === null) return base;
  if (auth.type === "basic") return { ...base, username: auth.username };
  if (auth.type === "api_key_header") return { ...base, headerName: auth.headerName };
  if (auth.type === "api_key_query") return { ...base, paramName: auth.paramName };
  if (auth.type === "oauth2_client_credentials") {
    return { ...base, tokenUrl: auth.tokenUrl, clientId: auth.clientId, scope: auth.scope };
  }
  return base;
}

function fieldOptions(
  fields: Array<{ name: string; label: string; type: string }>,
): WebhookFieldOption[] {
  const model: WebhookFieldOption[] = fields.map((field) => ({
    key: `${field.type === "file" ? "attachment" : "field"}:${field.name}`,
    source: field.type === "file" ? "attachment" : "field",
    field: field.name,
    label: field.label || field.name,
    kind: "model",
    file: field.type === "file",
  }));
  const meta: WebhookFieldOption[] = WEBHOOK_META_FIELDS.map((field) => ({
    key: `meta:${field}`,
    source: "meta",
    field,
    label: WEBHOOK_META_FIELD_LABELS[field],
    kind: "meta",
    file: false,
  }));
  const prospect: WebhookFieldOption[] = WEBHOOK_PROSPECT_FIELDS.map((field) => ({
    key: `prospect:${field}`,
    source: "prospect",
    field,
    label: WEBHOOK_PROSPECT_FIELD_LABELS[field],
    kind: "prospect",
    file: false,
  }));
  return [...model, ...meta, ...prospect];
}

function initialScope(
  endpoint: WebhookEndpointAdminDto | null,
  chatbots: WebhookChatbotOption[],
): ScopeDraft {
  if (endpoint !== null && endpoint.chatLinkId !== null) {
    return { chatLinkId: endpoint.chatLinkId, ficheKey: endpoint.ficheKey ?? "" };
  }
  const bot = chatbots.find((candidate) => candidate.fiches.length > 0);
  return { chatLinkId: bot?.chatLinkId ?? "", ficheKey: bot?.fiches[0]?.key ?? "" };
}

function scopeValue(scope: ScopeDraft): string {
  return `chatbot:${scope.chatLinkId}:${scope.ficheKey}`;
}

function parseScope(value: string): ScopeDraft {
  const [, chatLinkId = "", ...ficheParts] = value.split(":");
  return { chatLinkId, ficheKey: ficheParts.join(":") };
}

function scopeFields(
  scope: ScopeDraft,
  chatbots: WebhookChatbotOption[],
): Array<{ name: string; label: string; type: string }> {
  const bot = chatbots.find((candidate) => candidate.chatLinkId === scope.chatLinkId);
  const fiche = bot?.fiches.find((candidate) => candidate.key === scope.ficheKey);
  return fiche?.fields ?? bot?.fiches[0]?.fields ?? [];
}

function sampleValue(option: WebhookFieldOption): unknown {
  if (option.file) return "https://files.example.com/fichier.pdf";
  if (option.kind === "meta") return option.field === "ficheId" ? "fch_8d2f9e" : "valeur";
  if (option.kind === "prospect")
    return option.field.toLowerCase().includes("email") ? "exemple@entreprise.mg" : "valeur";
  return option.label;
}

function KeyValueEditor({
  title,
  entries,
  onChange,
  valuePlaceholder,
}: {
  title: string;
  entries: HeaderDraft[];
  onChange: (entries: HeaderDraft[]) => void;
  valuePlaceholder?: string;
}) {
  const update = (index: number, patch: Partial<HeaderDraft>): void => {
    onChange(
      entries.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
    );
  };
  return (
    <fieldset className="wh-fieldset">
      <legend>{title}</legend>
      {entries.length === 0 ? <p className="wh-hint">Aucune entrée configurée.</p> : null}
      {entries.map((entry, index) => (
        <div className="wh-kv-row" key={entry.uid}>
          <input
            aria-label="Nom du paramètre"
            value={entry.name}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="Clé"
          />
          <input
            aria-label="Valeur du paramètre"
            value={entry.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder={
              entry.secret ? (valuePlaceholder ?? "Laisser vide pour conserver") : "Valeur"
            }
            type={entry.secret ? "password" : "text"}
          />
          <label className="wh-check wh-kv-secret">
            <input
              type="checkbox"
              checked={entry.secret}
              onChange={(event) => update(index, { secret: event.target.checked })}
            />
            Secret
          </label>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => onChange(entries.filter((_entry, position) => position !== index))}
          >
            Retirer
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost small"
        onClick={() =>
          onChange([...entries, { uid: crypto.randomUUID(), name: "", value: "", secret: false }])
        }
      >
        Ajouter
      </button>
    </fieldset>
  );
}

export function WebhookWizard({
  endpoint,
  chatbots,
}: {
  endpoint: WebhookEndpointAdminDto | null;
  chatbots: WebhookChatbotOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(endpoint?.name ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [scope, setScope] = useState<ScopeDraft>(() => initialScope(endpoint, chatbots));
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const [httpMethod, setHttpMethod] = useState(endpoint?.httpMethod ?? "POST");
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [bodyMode, setBodyMode] = useState<string>(endpoint?.bodyMode ?? "json");
  const [bodyTemplate, setBodyTemplate] = useState(endpoint?.bodyTemplate ?? "");
  const [headers, setHeaders] = useState<HeaderDraft[]>(
    endpoint?.headers.map((header) => ({ ...header, uid: crypto.randomUUID() })) ?? [],
  );
  const [queryParams, setQueryParams] = useState<HeaderDraft[]>(
    endpoint?.queryParams.map((param) => ({ ...param, uid: crypto.randomUUID() })) ?? [],
  );
  const [auth, setAuth] = useState<AuthDraft>(authDraft(endpoint?.auth ?? null));
  const [mappings, setMappings] = useState<MappingDraft[]>(
    endpoint?.fieldMappings.map((mapping) => ({ ...mapping, fileMode: mapping.fileMode })) ?? [],
  );
  const [timeoutMs, setTimeoutMs] = useState(String(endpoint?.timeoutMs ?? 10000));
  const [maxAttempts, setMaxAttempts] = useState(String(endpoint?.maxAttempts ?? 3));
  const [retryBackoffMs, setRetryBackoffMs] = useState(String(endpoint?.retryBackoffMs ?? 30000));
  const [followRedirects, setFollowRedirects] = useState(endpoint?.followRedirects ?? false);
  const [tlsVerify, setTlsVerify] = useState(endpoint?.tlsVerify ?? true);
  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(
    endpoint?.allowPrivateNetwork ?? false,
  );
  const [activeTab, setActiveTab] = useState<Tab>("model");
  const [search, setSearch] = useState("");
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const options = useMemo(() => fieldOptions(scopeFields(scope, chatbots)), [scope, chatbots]);
  const tabOptions = options.filter((option) => option.kind === activeTab);
  const filteredTabOptions = tabOptions.filter((option) => {
    const needle = search.toLocaleLowerCase("fr").trim();
    return (
      needle === "" ||
      option.label.toLocaleLowerCase("fr").includes(needle) ||
      option.field.toLocaleLowerCase("fr").includes(needle)
    );
  });
  const selectedCount = mappings.length;
  const isEdit = endpoint !== null;
  const currentTitle = isEdit ? "Modifier le webhook" : "Créer un webhook";

  function mappingFor(option: WebhookFieldOption): MappingDraft | undefined {
    return mappings.find(
      (mapping) => mapping.source === option.source && mapping.field === option.field,
    );
  }

  function toggleMapping(option: WebhookFieldOption, checked: boolean): void {
    if (!checked) {
      setMappings((previous) =>
        previous.filter(
          (mapping) => !(mapping.source === option.source && mapping.field === option.field),
        ),
      );
      return;
    }
    setMappings((previous) => [
      ...previous,
      {
        source: option.source,
        field: option.field,
        target: option.field,
        required: true,
        fileMode: bodyMode === "multipart" ? "multipart" : "signed_url",
      },
    ]);
  }

  function updateMapping(option: WebhookFieldOption, patch: Partial<MappingDraft>): void {
    setMappings((previous) =>
      previous.map((mapping) =>
        mapping.source === option.source && mapping.field === option.field
          ? { ...mapping, ...patch }
          : mapping,
      ),
    );
  }

  function changeBodyMode(value: string): void {
    setBodyMode(value);
    if (value === "multipart") setBodyTemplate("");
    setMappings((previous) =>
      previous.map((mapping) =>
        mapping.source === "attachment"
          ? {
              ...mapping,
              fileMode:
                value === "multipart"
                  ? "multipart"
                  : mapping.fileMode === "multipart"
                    ? "signed_url"
                    : mapping.fileMode,
            }
          : mapping,
      ),
    );
  }

  function validateStep(index: number): boolean {
    if (index === 0) {
      if (name.trim() === "") {
        setError("Le nom du webhook est obligatoire.");
        return false;
      }
      if (scope.chatLinkId === "") {
        setError("Sélectionnez un périmètre de déclenchement.");
        return false;
      }
    }
    if (index === 1) {
      if (url.trim() === "") {
        setError("L’URL de destination est obligatoire.");
        return false;
      }
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
      } catch {
        setError("Saisissez une URL HTTP(S) valide.");
        return false;
      }
    }
    if (index === 2) {
      const missing = mappings.find((mapping) => mapping.target.trim() === "");
      if (missing !== undefined) {
        setError("Chaque champ inclus doit posséder une clé cible.");
        return false;
      }
      if (mappings.length === 0 && bodyTemplate.trim() === "") {
        setError("Sélectionnez au moins un champ à envoyer ou définissez un template de corps.");
        return false;
      }
    }
    return true;
  }

  function goToStep(target: number): void {
    if (target < 0 || target > 4) return;
    if (target > step) {
      for (let index = step; index < target; index += 1) {
        if (!validateStep(index)) return;
      }
    }
    setError(null);
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(): Promise<void> {
    if (submittingRef.current) return;
    if (!validateStep(0) || !validateStep(1) || !validateStep(2)) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        endpoint === null ? "/api/webhooks" : `/api/webhooks/${endpoint.id}`,
        {
          method: endpoint === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            chatLinkId: scope.chatLinkId === "" ? null : scope.chatLinkId,
            ficheKey: scope.ficheKey === "" ? null : scope.ficheKey,
            enabled,
            httpMethod,
            url,
            bodyMode,
            bodyTemplate,
            headers,
            queryParams,
            auth,
            fieldMappings: mappings,
            timeoutMs: Number(timeoutMs),
            maxAttempts: Number(maxAttempts),
            retryBackoffMs: Number(retryBackoffMs),
            followRedirects,
            tlsVerify,
            allowPrivateNetwork,
          }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success(endpoint === null ? "Webhook créé." : "Webhook enregistré.");
      router.push("/parametres/webhooks");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  async function testWebhook(): Promise<void> {
    if (endpoint === null) return;
    if (
      !(await confirmDialog(
        `Envoyer un test réel à « ${endpoint.name} » ?\nUne requête HTTP sera effectuée vers ${endpoint.url}.`,
      ))
    ) {
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const response = await fetch(`/api/webhooks/${endpoint.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        responseStatus?: number | null;
        errorMessage?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Test impossible");
        return;
      }
      if (
        json.responseStatus !== null &&
        json.responseStatus !== undefined &&
        json.responseStatus >= 200 &&
        json.responseStatus < 300
      ) {
        toast.success(`Test réussi (HTTP ${json.responseStatus}).`);
      } else {
        setError(json.errorMessage ?? `Le test a échoué (HTTP ${json.responseStatus ?? "—"}).`);
      }
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setTesting(false);
    }
  }

  function renderAuthFields(): ReactNode {
    switch (auth.type) {
      case "bearer":
        return (
          <label className="wh-field wh-span2">
            Token Bearer
            <input
              type="password"
              value={auth.token}
              placeholder={endpoint?.auth.type === "bearer" ? "Laisser vide pour conserver" : ""}
              onChange={(event) => setAuth({ ...auth, token: event.target.value })}
            />
          </label>
        );
      case "basic":
        return (
          <>
            <label className="wh-field">
              Identifiant
              <input
                value={auth.username}
                onChange={(event) => setAuth({ ...auth, username: event.target.value })}
              />
            </label>
            <label className="wh-field">
              Mot de passe
              <input
                type="password"
                value={auth.password}
                placeholder={endpoint?.auth.type === "basic" ? "Laisser vide pour conserver" : ""}
                onChange={(event) => setAuth({ ...auth, password: event.target.value })}
              />
            </label>
          </>
        );
      case "api_key_header":
        return (
          <>
            <label className="wh-field">
              Nom de l’en-tête
              <input
                value={auth.headerName}
                placeholder="X-Api-Key"
                onChange={(event) => setAuth({ ...auth, headerName: event.target.value })}
              />
            </label>
            <label className="wh-field">
              Clé
              <input
                type="password"
                value={auth.key}
                placeholder={
                  endpoint?.auth.type === "api_key_header" ? "Laisser vide pour conserver" : ""
                }
                onChange={(event) => setAuth({ ...auth, key: event.target.value })}
              />
            </label>
          </>
        );
      case "api_key_query":
        return (
          <>
            <label className="wh-field">
              Nom du paramètre
              <input
                value={auth.paramName}
                placeholder="api_key"
                onChange={(event) => setAuth({ ...auth, paramName: event.target.value })}
              />
            </label>
            <label className="wh-field">
              Clé
              <input
                type="password"
                value={auth.key}
                placeholder={
                  endpoint?.auth.type === "api_key_query" ? "Laisser vide pour conserver" : ""
                }
                onChange={(event) => setAuth({ ...auth, key: event.target.value })}
              />
            </label>
          </>
        );
      case "hmac":
        return (
          <label className="wh-field wh-span2">
            Secret HMAC
            <input
              type="password"
              value={auth.secret}
              placeholder={endpoint?.auth.type === "hmac" ? "Laisser vide pour conserver" : ""}
              onChange={(event) => setAuth({ ...auth, secret: event.target.value })}
            />
          </label>
        );
      case "oauth2_client_credentials":
        return (
          <>
            <label className="wh-field wh-span2">
              URL du token
              <input
                type="url"
                value={auth.tokenUrl}
                placeholder="https://auth.example.com/oauth/token"
                onChange={(event) => setAuth({ ...auth, tokenUrl: event.target.value })}
              />
            </label>
            <label className="wh-field">
              Client ID
              <input
                value={auth.clientId}
                onChange={(event) => setAuth({ ...auth, clientId: event.target.value })}
              />
            </label>
            <label className="wh-field">
              Client secret
              <input
                type="password"
                value={auth.clientSecret}
                placeholder={
                  endpoint?.auth.type === "oauth2_client_credentials"
                    ? "Laisser vide pour conserver"
                    : ""
                }
                onChange={(event) => setAuth({ ...auth, clientSecret: event.target.value })}
              />
            </label>
            <label className="wh-field wh-span2">
              Scope
              <input
                value={auth.scope}
                onChange={(event) => setAuth({ ...auth, scope: event.target.value })}
              />
            </label>
          </>
        );
      default:
        return null;
    }
  }

  function displayScope(): string {
    const bot = chatbots.find((candidate) => candidate.chatLinkId === scope.chatLinkId);
    if (bot === undefined) return "Non défini";
    const fiche = bot.fiches.find((candidate) => candidate.key === scope.ficheKey);
    return fiche === undefined ? bot.label : `${bot.label} — ${fiche.label}`;
  }

  function payloadObject(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const mapping of mappings) {
      const option = options.find(
        (candidate) => candidate.source === mapping.source && candidate.field === mapping.field,
      );
      if (option !== undefined && mapping.target.trim() !== "") {
        data[mapping.target.trim()] = sampleValue(option);
      }
    }
    return data;
  }

  const noBody = httpMethod === "GET" || httpMethod === "HEAD";
  const preview = noBody
    ? "(Méthode sans corps)"
    : bodyTemplate.trim() !== ""
      ? bodyTemplate
      : JSON.stringify(payloadObject(), null, 2);
  const reviewItems = [
    ["Webhook", name || "—"],
    ["État", enabled ? "Actif" : "Inactif"],
    ["Périmètre", displayScope()],
    ["Destination", url || "—"],
    [
      "Méthode / format",
      `${httpMethod} / ${noBody ? "Sans corps" : (BODY_LABELS[bodyMode] ?? bodyMode)}`,
    ],
    ["Authentification", AUTH_LABELS[auth.type] ?? auth.type],
    [
      "Tentatives",
      `${maxAttempts} · délai ${Number(retryBackoffMs || 0).toLocaleString("fr-FR")} ms`,
    ],
    ["Timeout", `${Number(timeoutMs || 0).toLocaleString("fr-FR")} ms`],
  ];
  const reviewWarnings = [
    !enabled ? "Le webhook est actuellement inactif." : null,
    allowPrivateNetwork ? "Attention : l’accès au réseau privé est activé." : null,
    !tlsVerify ? "La vérification TLS est désactivée." : null,
    selectedCount === 0 && bodyTemplate.trim() === ""
      ? "Aucun champ sélectionné pour l’envoi."
      : null,
  ].filter((message): message is string => message !== null);

  return (
    <div className="wh-page">
      <nav className="wh-breadcrumbs" aria-label="Fil d’Ariane">
        <Link href="/parametres">Paramètres</Link>
        <span>/</span>
        <Link href="/parametres/webhooks">Webhooks</Link>
        <span>/</span>
        <strong>{isEdit ? "Modifier" : "Créer"}</strong>
      </nav>

      <div className="wh-page-head">
        <div>
          <span className="eyebrow">Configuration d’intégration</span>
          <h1 className="text-title">{currentTitle}</h1>
        </div>
        <div className="wh-head-state">
          <span className={`wh-status ${enabled ? "" : "is-inactive"}`}>
            <span className="wh-status-dot" />
            {enabled ? "Actif" : "Inactif"}
          </span>
        </div>
      </div>

      <div className="wh-workspace">
        <aside className="wh-side" aria-label="Étapes de configuration">
          <div className="wh-side-caption">Votre parcours</div>
          <ol className="wh-steps">
            {STEPS.map((item, index) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={`wh-step ${step === index ? "is-current" : ""} ${step > index ? "is-done" : ""}`}
                  onClick={() => goToStep(index)}
                  aria-current={step === index ? "step" : undefined}
                >
                  <span className="wh-step-number">{step > index ? "✓" : index + 1}</span>
                  <span className="wh-step-info">
                    <span className="wh-step-label">{item.label}</span>
                    <span className="wh-step-desc">{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="wh-main">
          <div className="wh-progress-meta">
            <span>
              <strong>Étape {step + 1} sur 5</strong> · {STEPS[step]?.label ?? ""}
            </span>
            <span>{((step + 1) * 20).toFixed(0)} %</span>
          </div>
          <div
            className="wh-progress"
            role="progressbar"
            aria-label="Progression"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={(step + 1) * 20}
          >
            <span style={{ width: `${(step + 1) * 20}%` }} />
          </div>

          <form
            className="wh-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {error !== null ? <p className="alert error">{error}</p> : null}

            <section className="wh-panel" hidden={step !== 0} aria-labelledby="wh-title-general">
              <div className="wh-panel-heading">
                <div className="wh-panel-kicker">01 / Informations générales</div>
                <h2 id="wh-title-general">Commençons par l’essentiel.</h2>
                <p className="wh-panel-lede">
                  Donnez un nom à ce webhook et choisissez les fiches qui déclencheront son
                  exécution.
                </p>
              </div>
              <div className="wh-grid-2">
                <label className="wh-field wh-span2">
                  <span>
                    Nom du webhook <span className="wh-required">*</span>
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    required
                  />
                  <small className="wh-hint">
                    Un nom interne pour retrouver facilement cette intégration.
                  </small>
                </label>
                <label className="wh-field wh-span2">
                  <span>
                    Périmètre de déclenchement <span className="wh-required">*</span>
                  </span>
                  <select
                    value={scopeValue(scope)}
                    onChange={(event) => {
                      setScope(parseScope(event.target.value));
                      setMappings([]);
                      setActiveTab("model");
                    }}
                    required
                  >
                    {chatbots.length > 0 ? (
                      <optgroup label="Chatbots / fiches de collecte">
                        {chatbots.flatMap((bot) => [
                          <option key={`${bot.chatLinkId}:*`} value={`chatbot:${bot.chatLinkId}:`}>
                            {bot.label} — toutes les fiches
                          </option>,
                          ...bot.fiches.map((fiche) => (
                            <option
                              key={`${bot.chatLinkId}:${fiche.key}`}
                              value={`chatbot:${bot.chatLinkId}:${fiche.key}`}
                            >
                              {bot.label} — {fiche.label}
                            </option>
                          )),
                        ])}
                      </optgroup>
                    ) : null}
                  </select>
                  <small className="wh-hint">
                    Sélectionnez un chatbot entier ou une fiche précise.
                  </small>
                </label>
                <label className="wh-field wh-span2">
                  <span>
                    Description <span className="wh-muted">(facultatif)</span>
                  </span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={500}
                  />
                </label>
              </div>
              <div className="wh-divider" />
              <label className="wh-toggle-line">
                <span className="wh-toggle-copy">
                  <strong>Activer ce webhook</strong>
                  <small>
                    Lorsque ce webhook est actif, les événements éligibles peuvent déclencher un
                    envoi.
                  </small>
                </span>
                <span className="wh-switch">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                  />
                  <span className="wh-switch-track" />
                </span>
              </label>
            </section>

            <section
              className="wh-panel"
              hidden={step !== 1}
              aria-labelledby="wh-title-destination"
            >
              <div className="wh-panel-heading">
                <div className="wh-panel-kicker">02 / Destination</div>
                <h2 id="wh-title-destination">Où envoyer les informations ?</h2>
                <p className="wh-panel-lede">
                  Indiquez l’adresse de votre API, la méthode HTTP et le format des données.
                </p>
              </div>
              <div className="wh-grid-2">
                <label className="wh-field wh-span2">
                  <span>
                    URL de destination <span className="wh-required">*</span>
                  </span>
                  <input
                    type="url"
                    value={url}
                    placeholder="https://api.exemple.com/webhooks"
                    onChange={(event) => setUrl(event.target.value)}
                    required
                  />
                  <small className="wh-hint">Une URL HTTPS publique est recommandée.</small>
                </label>
                <label className="wh-field">
                  Méthode HTTP
                  <select
                    value={httpMethod}
                    onChange={(event) => setHttpMethod(event.target.value as typeof httpMethod)}
                  >
                    {WEBHOOK_HTTP_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {METHOD_LABELS[method] ?? method}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wh-field">
                  Format du corps
                  <select
                    value={bodyMode}
                    onChange={(event) => changeBodyMode(event.target.value)}
                    disabled={noBody}
                  >
                    {WEBHOOK_BODY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {BODY_LABELS[mode] ?? mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <details className="wh-accordion">
                <summary>
                  <span>
                    Paramètres de requête supplémentaires <small>· facultatif</small>
                  </span>
                  <span className="wh-chevron">⌄</span>
                </summary>
                <div className="wh-accordion-content">
                  <h3>Paramètres de query</h3>
                  <KeyValueEditor title="Query" entries={queryParams} onChange={setQueryParams} />
                  <div className="wh-divider" />
                  <h3>En-têtes personnalisés</h3>
                  <KeyValueEditor title="En-têtes" entries={headers} onChange={setHeaders} />
                </div>
              </details>
            </section>

            <section className="wh-panel" hidden={step !== 2} aria-labelledby="wh-title-data">
              <div className="wh-panel-heading">
                <div className="wh-panel-kicker">03 / Correspondances</div>
                <h2 id="wh-title-data">Quelles données envoyer ?</h2>
                <p className="wh-panel-lede">
                  Choisissez les champs utiles et associez-les aux clés attendues par votre API.
                </p>
              </div>
              <div className="wh-data-toolbar">
                <div className="wh-tabs" role="tablist" aria-label="Catégories de champs">
                  {(["model", "meta", "prospect"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === kind}
                      className={`wh-tab ${activeTab === kind ? "is-active" : ""}`}
                      onClick={() => {
                        setActiveTab(kind);
                        setSearch("");
                      }}
                    >
                      {kind === "model" ? "Fiche" : kind === "meta" ? "Métadonnées" : "Prospect"}{" "}
                      <span>({options.filter((option) => option.kind === kind).length})</span>
                    </button>
                  ))}
                </div>
                <span className="wh-count">
                  {selectedCount} champ{selectedCount !== 1 ? "s" : ""} sélectionné
                  {selectedCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="wh-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un champ…"
                  aria-label="Rechercher un champ"
                />
              </div>
              <div className="wh-data-head">
                <span>Champ</span>
                <span>Inclure</span>
                <span>Clé cible</span>
                <span>Requis</span>
              </div>
              <div className="wh-data-list">
                {filteredTabOptions.length === 0 ? (
                  <div className="wh-empty">Aucun champ ne correspond à cette recherche.</div>
                ) : (
                  filteredTabOptions.map((option) => {
                    const mapping = mappingFor(option);
                    return (
                      <div className="wh-data-row" key={option.key}>
                        <div className="wh-data-name">
                          <span>{option.label}</span>
                          {option.file && mapping !== undefined ? (
                            <select
                              className="wh-file-mode"
                              value={mapping.fileMode}
                              aria-label={`Mode fichier pour ${option.label}`}
                              onChange={(event) =>
                                updateMapping(option, { fileMode: event.target.value })
                              }
                            >
                              <option value="signed_url">URL signée</option>
                              <option value="base64">Base64</option>
                              <option value="multipart">Multipart</option>
                            </select>
                          ) : null}
                        </div>
                        <label className="wh-check">
                          <input
                            type="checkbox"
                            checked={mapping !== undefined}
                            onChange={(event) => toggleMapping(option, event.target.checked)}
                            aria-label={`Inclure ${option.label}`}
                          />
                        </label>
                        <input
                          type="text"
                          className="wh-target"
                          value={mapping?.target ?? ""}
                          disabled={mapping === undefined}
                          aria-label={`Clé cible pour ${option.label}`}
                          onChange={(event) =>
                            updateMapping(option, { target: event.target.value })
                          }
                        />
                        <label className="wh-check">
                          <input
                            type="checkbox"
                            checked={mapping?.required ?? false}
                            disabled={mapping === undefined}
                            aria-label={`Rendre ${option.label} obligatoire`}
                            onChange={(event) =>
                              updateMapping(option, { required: event.target.checked })
                            }
                          />
                        </label>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="wh-review-foot">
                « Requis » signifie que la valeur doit être disponible pour cet envoi. Les champs
                non inclus ne figurent pas dans le corps.
              </p>
              <details className="wh-accordion">
                <summary>
                  <span>
                    Template de corps personnalisé <small>· avancé, facultatif</small>
                  </span>
                  <span className="wh-chevron">⌄</span>
                </summary>
                <div className="wh-accordion-content">
                  <label className="wh-field">
                    Template de corps
                    <textarea
                      rows={6}
                      value={bodyTemplate}
                      onChange={(event) => setBodyTemplate(event.target.value)}
                      placeholder={'{"id": {{ficheId}}, "nom": {{nom}}}'}
                      spellCheck={false}
                    />
                    <small className="wh-hint">
                      Placeholders disponibles : champs de la fiche, prospect.* et métadonnées. En
                      JSON, ne placez pas de guillemets autour des placeholders.
                    </small>
                  </label>
                </div>
              </details>
            </section>

            <section className="wh-panel" hidden={step !== 3} aria-labelledby="wh-title-security">
              <div className="wh-panel-heading">
                <div className="wh-panel-kicker">04 / Sécurité &amp; fiabilité</div>
                <h2 id="wh-title-security">Comment sécuriser l’envoi ?</h2>
                <p className="wh-panel-lede">
                  Sélectionnez une authentification. Les paramètres réseau et de reprise restent
                  disponibles séparément.
                </p>
              </div>
              <h3>Authentification</h3>
              <div className="wh-grid-2">
                <label className="wh-field wh-span2">
                  Méthode d’authentification
                  <select
                    value={auth.type}
                    onChange={(event) => setAuth({ ...auth, type: event.target.value })}
                  >
                    {WEBHOOK_AUTH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {AUTH_LABELS[type] ?? type}
                      </option>
                    ))}
                  </select>
                  <small className="wh-hint">
                    Les champs nécessaires apparaissent uniquement selon la méthode choisie.
                  </small>
                </label>
                {renderAuthFields()}
              </div>

              <details className="wh-accordion">
                <summary>
                  <span>
                    Réseau et fiabilité <small>· TLS, redirections et reprises</small>
                  </span>
                  <span className="wh-chevron">⌄</span>
                </summary>
                <div className="wh-accordion-content">
                  <h3>Politique de reprise</h3>
                  <div className="wh-grid-2">
                    <label className="wh-field">
                      Timeout (ms)
                      <input
                        type="number"
                        min={1000}
                        max={30000}
                        step={1000}
                        value={timeoutMs}
                        onChange={(event) => setTimeoutMs(event.target.value)}
                      />
                    </label>
                    <label className="wh-field">
                      Tentatives max
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={1}
                        value={maxAttempts}
                        onChange={(event) => setMaxAttempts(event.target.value)}
                      />
                    </label>
                    <label className="wh-field wh-span2">
                      Délai de reprise initial (ms)
                      <input
                        type="number"
                        min={1000}
                        max={900000}
                        step={1000}
                        value={retryBackoffMs}
                        onChange={(event) => setRetryBackoffMs(event.target.value)}
                      />
                      <small className="wh-hint">
                        Délai de départ avant un nouvel essai en cas d’échec.
                      </small>
                    </label>
                  </div>
                  <div className="wh-divider" />
                  <h3>Réseau et transport</h3>
                  <div className="wh-security-stack">
                    <label className="wh-toggle-line">
                      <span className="wh-toggle-copy">
                        <strong>Vérifier le certificat TLS</strong>
                        <small>Activé par défaut et recommandé pour les connexions HTTPS.</small>
                      </span>
                      <span className="wh-switch">
                        <input
                          type="checkbox"
                          checked={tlsVerify}
                          onChange={(event) => setTlsVerify(event.target.checked)}
                        />
                        <span className="wh-switch-track" />
                      </span>
                    </label>
                    <label className="wh-toggle-line">
                      <span className="wh-toggle-copy">
                        <strong>Suivre les redirections</strong>
                        <small>Jusqu’à 3 redirections HTTP.</small>
                      </span>
                      <span className="wh-switch">
                        <input
                          type="checkbox"
                          checked={followRedirects}
                          onChange={(event) => setFollowRedirects(event.target.checked)}
                        />
                        <span className="wh-switch-track" />
                      </span>
                    </label>
                    <label className="wh-toggle-line">
                      <span className="wh-toggle-copy">
                        <strong>Autoriser le réseau privé</strong>
                        <small>
                          Option sensible : n’activer qu’avec des contrôles réseau adaptés.
                        </small>
                      </span>
                      <span className="wh-switch">
                        <input
                          type="checkbox"
                          checked={allowPrivateNetwork}
                          onChange={(event) => setAllowPrivateNetwork(event.target.checked)}
                        />
                        <span className="wh-switch-track" />
                      </span>
                    </label>
                  </div>
                </div>
              </details>
            </section>

            <section className="wh-panel" hidden={step !== 4} aria-labelledby="wh-title-review">
              <div className="wh-panel-heading">
                <div className="wh-panel-kicker">05 / Vérification finale</div>
                <h2 id="wh-title-review">Tout est prêt à être vérifié.</h2>
                <p className="wh-panel-lede">
                  Relisez les paramètres principaux et prévisualisez le corps généré.
                </p>
              </div>
              {reviewWarnings.length > 0 ? (
                <div className="alert warning">{reviewWarnings.join(" ")}</div>
              ) : null}
              <div className="wh-summary-grid">
                {reviewItems.map(([label, value]) => (
                  <div className="wh-summary-item" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="wh-review-bar">
                <h3>Aperçu des données (exemple)</h3>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(preview)
                      .then(() => toast.success("Aperçu copié dans le presse-papiers."))
                      .catch(() => toast.error("Copie indisponible dans ce navigateur."));
                  }}
                >
                  Copier JSON
                </button>
              </div>
              <pre className="wh-code">{preview}</pre>
              <p className="wh-review-foot">
                Cet aperçu utilise des valeurs fictives. Il ne constitue ni un appel HTTP ni une
                validation de l’API de destination.
              </p>
              <div className="wh-review-actions">
                <button
                  className="btn ghost"
                  type="button"
                  disabled={!isEdit || testing}
                  onClick={() => void testWebhook()}
                >
                  {testing ? "Test en cours…" : "Tester le webhook"}
                </button>
                {!isEdit ? (
                  <span className="wh-hint">
                    Le test est disponible après le premier enregistrement.
                  </span>
                ) : null}
              </div>
            </section>

            <div className="wh-footer">
              <div className="wh-footer-inner">
                <Link className="btn ghost" href="/parametres/webhooks">
                  Annuler
                </Link>
                <div className="wh-footer-actions">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={step === 0 || pending}
                    onClick={() => goToStep(step - 1)}
                  >
                    Précédent
                  </button>
                  {step === 4 ? (
                    <button className="btn" type="submit" disabled={pending}>
                      {pending ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer le webhook"}
                    </button>
                  ) : (
                    <button className="btn" type="button" onClick={() => goToStep(step + 1)}>
                      Continuer
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
