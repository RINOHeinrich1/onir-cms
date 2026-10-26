"use client";

import { type ReactNode, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
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
import type { WebhookEndpointAdminDto, WebhookFieldOption, WebhookTemplateOption } from "./types";

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
  api_key_header: "API key (en-tête)",
  api_key_query: "API key (query)",
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
    return {
      ...base,
      tokenUrl: auth.tokenUrl,
      clientId: auth.clientId,
      scope: auth.scope,
    };
  }
  return base;
}

function fieldOptions(template: WebhookTemplateOption | null): WebhookFieldOption[] {
  if (template === null) return [];
  const model: WebhookFieldOption[] = template.fields.map((field) => ({
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

function KeyValueEditor({
  title,
  entries,
  onChange,
  valuePlaceholder,
  secretLabel,
}: {
  title: string;
  entries: HeaderDraft[];
  onChange: (entries: HeaderDraft[]) => void;
  valuePlaceholder?: string;
  secretLabel: string;
}) {
  const update = (index: number, patch: Partial<HeaderDraft>): void => {
    onChange(
      entries.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
    );
  };
  return (
    <fieldset className="field">
      <legend>{title}</legend>
      {entries.length === 0 ? <p className="hint">Aucune entrée.</p> : null}
      {entries.map((entry, index) => (
        <div className="tools" key={entry.uid} style={{ alignItems: "end" }}>
          <label className="field" style={{ minWidth: "10rem" }}>
            Nom
            <input
              value={entry.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="X-Header"
            />
          </label>
          <label className="field" style={{ minWidth: "14rem" }}>
            Valeur
            <input
              value={entry.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder={entry.secret ? (valuePlaceholder ?? "Laisser vide pour conserver") : ""}
              type={entry.secret ? "password" : "text"}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={entry.secret}
              onChange={(event) => update(index, { secret: event.target.checked })}
            />{" "}
            {secretLabel}
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

export function WebhookForm({
  endpoint,
  templates,
  onSaved,
  onCancel,
}: {
  endpoint: WebhookEndpointAdminDto | null;
  templates: WebhookTemplateOption[];
  onSaved: (endpoint: WebhookEndpointAdminDto) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(endpoint?.name ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [templateKey, setTemplateKey] = useState(endpoint?.templateKey ?? templates[0]?.key ?? "");
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
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(endpoint?.allowInsecureHttp ?? false);
  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(
    endpoint?.allowPrivateNetwork ?? false,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const selectedTemplate = templates.find((template) => template.key === templateKey) ?? null;
  const options = fieldOptions(selectedTemplate);

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

  async function submit(): Promise<void> {
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
            templateKey,
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
      const json = (await response.json()) as {
        endpoint?: WebhookEndpointAdminDto;
        error?: string;
      };
      if (!response.ok || json.endpoint === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      onSaved(json.endpoint);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  function renderAuthFields(): ReactNode {
    switch (auth.type) {
      case "bearer":
        return (
          <label className="field">
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
          <div className="grid-2">
            <label className="field">
              Identifiant
              <input
                value={auth.username}
                onChange={(event) => setAuth({ ...auth, username: event.target.value })}
              />
            </label>
            <label className="field">
              Mot de passe
              <input
                type="password"
                value={auth.password}
                placeholder={endpoint?.auth.type === "basic" ? "Laisser vide pour conserver" : ""}
                onChange={(event) => setAuth({ ...auth, password: event.target.value })}
              />
            </label>
          </div>
        );
      case "api_key_header":
        return (
          <div className="grid-2">
            <label className="field">
              Nom de l&apos;en-tête
              <input
                value={auth.headerName}
                placeholder="X-Api-Key"
                onChange={(event) => setAuth({ ...auth, headerName: event.target.value })}
              />
            </label>
            <label className="field">
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
          </div>
        );
      case "api_key_query":
        return (
          <div className="grid-2">
            <label className="field">
              Nom du paramètre
              <input
                value={auth.paramName}
                placeholder="api_key"
                onChange={(event) => setAuth({ ...auth, paramName: event.target.value })}
              />
            </label>
            <label className="field">
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
          </div>
        );
      case "hmac":
        return (
          <label className="field">
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
            <label className="field">
              URL du token
              <input
                value={auth.tokenUrl}
                placeholder="https://auth.example.com/oauth/token"
                onChange={(event) => setAuth({ ...auth, tokenUrl: event.target.value })}
              />
            </label>
            <div className="grid-2">
              <label className="field">
                Client ID
                <input
                  value={auth.clientId}
                  onChange={(event) => setAuth({ ...auth, clientId: event.target.value })}
                />
              </label>
              <label className="field">
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
            </div>
            <label className="field">
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

  function renderGroup(title: string, kind: WebhookFieldOption["kind"]): ReactNode {
    const group = options.filter((option) => option.kind === kind);
    if (group.length === 0) return null;
    return (
      <div style={{ marginBottom: "1rem" }}>
        <h4>{title}</h4>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Champ</th>
                <th>Inclure</th>
                <th>Clé cible</th>
                <th>Obligatoire</th>
                {kind === "model" ? <th>Fichier</th> : null}
              </tr>
            </thead>
            <tbody>
              {group.map((option) => {
                const mapping = mappingFor(option);
                return (
                  <tr key={option.key}>
                    <td>{option.label}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={mapping !== undefined}
                        onChange={(event) => toggleMapping(option, event.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        value={mapping?.target ?? ""}
                        disabled={mapping === undefined}
                        onChange={(event) => updateMapping(option, { target: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={mapping?.required ?? false}
                        disabled={mapping === undefined}
                        onChange={(event) =>
                          updateMapping(option, { required: event.target.checked })
                        }
                      />
                    </td>
                    {kind === "model" ? (
                      <td>
                        {option.file && mapping !== undefined ? (
                          <select
                            value={mapping.fileMode}
                            onChange={(event) =>
                              updateMapping(option, { fileMode: event.target.value })
                            }
                          >
                            <option value="signed_url">URL signée</option>
                            <option value="base64">Base64</option>
                            <option value="multipart">Multipart</option>
                          </select>
                        ) : (
                          <span className="muted-text">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="grid-2">
        <label className="field">
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          Modèle de raisonnement
          <select
            value={templateKey}
            onChange={(event) => {
              setTemplateKey(event.target.value);
              setMappings([]);
            }}
            required
          >
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label} ({template.key})
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        Description
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />
      </label>

      <div className="grid-2">
        <label className="field">
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
        <label className="check" style={{ alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />{" "}
          Webhook actif
        </label>
      </div>

      <label className="field">
        URL
        <input
          type="url"
          value={url}
          placeholder="https://partenaire.example.com/hooks/leads"
          onChange={(event) => setUrl(event.target.value)}
          required
        />
      </label>

      <div className="grid-2">
        <label className="field">
          Corps
          <select value={bodyMode} onChange={(event) => changeBodyMode(event.target.value)}>
            {WEBHOOK_BODY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {BODY_LABELS[mode] ?? mode}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Authentification
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
        </label>
      </div>

      {renderAuthFields()}

      <div className="grid-2">
        <label className="field">
          Timeout (ms)
          <input
            type="number"
            min={1000}
            max={30000}
            value={timeoutMs}
            onChange={(event) => setTimeoutMs(event.target.value)}
          />
        </label>
        <label className="field">
          Tentatives max
          <input
            type="number"
            min={1}
            max={5}
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        Délai de reprise initial (ms)
        <input
          type="number"
          min={1000}
          max={900000}
          value={retryBackoffMs}
          onChange={(event) => setRetryBackoffMs(event.target.value)}
        />
      </label>

      <div className="tools">
        <label className="check">
          <input
            type="checkbox"
            checked={followRedirects}
            onChange={(event) => setFollowRedirects(event.target.checked)}
          />{" "}
          Suivre les redirections (max 3)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={tlsVerify}
            onChange={(event) => setTlsVerify(event.target.checked)}
          />{" "}
          Vérifier le certificat TLS
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={allowInsecureHttp}
            onChange={(event) => setAllowInsecureHttp(event.target.checked)}
          />{" "}
          Autoriser HTTP non chiffré
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={allowPrivateNetwork}
            onChange={(event) => setAllowPrivateNetwork(event.target.checked)}
          />{" "}
          Autoriser le réseau privé
        </label>
      </div>

      <KeyValueEditor
        title="Paramètres de query"
        entries={queryParams}
        onChange={setQueryParams}
        secretLabel="Secret"
      />
      <KeyValueEditor
        title="En-têtes"
        entries={headers}
        onChange={setHeaders}
        secretLabel="Secret"
      />

      <label className="field">
        Template de corps avancé (optionnel)
        <textarea
          rows={5}
          value={bodyTemplate}
          onChange={(event) => setBodyTemplate(event.target.value)}
          placeholder={'{"id": {{id}}, "contact": {{contact}}}'}
        />
        <span className="hint">
          Placeholders disponibles : champs du modèle, prospect.* et métadonnées. En JSON, le
          placeholder est remplacé par une valeur JSON (ne pas l&apos;entourer de guillemets).
        </span>
      </label>

      <h4>Champs envoyés</h4>
      {renderGroup("Champs du modèle", "model")}
      {renderGroup("Métadonnées de la fiche", "meta")}
      {renderGroup("Prospect", "prospect")}

      <div className="tools">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Enregistrement…" : endpoint === null ? "Créer le webhook" : "Enregistrer"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={pending}>
          Annuler
        </button>
      </div>
    </form>
  );
}
