import { randomBytes } from "node:crypto";
import { NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { WebhookHttpRequest } from "@/application/ports/webhook-sender";
import type { FicheAttachment } from "@/domain/entities/attachment";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";
import {
  WEBHOOK_LIMITS,
  WEBHOOK_SENSITIVE_HEADERS,
  type WebhookEndpoint,
  type WebhookFieldMapping,
  type WebhookRequestSnapshot,
} from "@/domain/entities/webhook";
import { signedAttachmentUrl } from "@/lib/attachment-token";
import { appUrl } from "@/lib/env";

export type BuildWebhookRequestDependencies = {
  templates: ChatTemplateRepository;
  prospects: ProspectRepository;
  attachments: AttachmentRepository;
  storage: AttachmentStorage;
};

export type BuiltWebhookRequest = {
  request: WebhookHttpRequest;
  snapshot: WebhookRequestSnapshot;
  attachmentCount: number;
};

type FileValue =
  | {
      id: string;
      filename: string;
      mime: string;
      sizeBytes: number;
      url: string;
    }
  | {
      id: string;
      filename: string;
      mime: string;
      sizeBytes: number;
      base64: string;
    };

type MultipartPart = {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      throw new ValidationError("Clé cible invalide");
    }
    const current = cursor[part];
    if (!isRecord(current)) {
      const next: Record<string, unknown> = {};
      cursor[part] = next;
      cursor = next;
    } else {
      cursor = current;
    }
  }
  const last = parts[parts.length - 1];
  if (last === undefined || last === "__proto__" || last === "constructor") {
    throw new ValidationError("Clé cible invalide");
  }
  cursor[last] = value;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function stringifyForText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function replacePlaceholders(
  template: string,
  values: Record<string, unknown>,
  mode: "json" | "text" | "url",
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new UnprocessableError(`Variable de webhook inconnue : ${key}`);
    const value = values[key];
    if (mode === "json") return JSON.stringify(value ?? null);
    if (mode === "url") return encodeURIComponent(stringifyForText(value));
    return stringifyForText(value);
  });
}

function absoluteAttachmentUrl(attachment: FicheAttachment): string {
  const base = appUrl().replace(/\/+$/, "");
  return `${base}${signedAttachmentUrl(attachment.id, attachment.organizationId)}`;
}

function attachmentDescriptor(attachment: FicheAttachment): FileValue {
  return {
    id: attachment.id,
    filename: attachment.originalName,
    mime: attachment.mime,
    sizeBytes: attachment.sizeBytes,
    url: absoluteAttachmentUrl(attachment),
  };
}

function metaValue(fiche: Fiche, field: string): unknown {
  switch (field) {
    case "id":
      return fiche.id;
    case "createdAt":
      return fiche.createdAt;
    case "templateKey":
      return fiche.templateKey;
    case "templateVersion":
      return fiche.templateVersion;
    case "conversationId":
      return fiche.conversationId;
    case "prospectId":
      return fiche.prospectId;
    case "archivee":
      return fiche.archivee;
    default:
      return undefined;
  }
}

function prospectValue(prospect: Prospect | null, field: string): unknown {
  if (prospect === null) return undefined;
  if (field === "id") return prospect.id;
  if (field === "nom") return prospect.nom;
  if (field === "prenom") return prospect.prenom;
  if (field === "nature") return prospect.nature;
  if (field === "email") return prospect.email;
  if (field === "activite") return prospect.activite;
  if (field === "fonction") return prospect.fonction;
  if (field === "detail") return prospect.detail;
  if (field === "origine") return prospect.origine;
  if (field === "lienId") return prospect.lienId;
  if (field === "lienLabel") return prospect.lienLabel;
  if (field === "createdAt") return prospect.createdAt;
  if (field === "updatedAt") return prospect.updatedAt;
  return undefined;
}

function fieldGroups(attachments: readonly FicheAttachment[]): Map<string, FicheAttachment[]> {
  const groups = new Map<string, FicheAttachment[]>();
  for (const attachment of attachments) {
    const group = groups.get(attachment.fieldName) ?? [];
    group.push(attachment);
    groups.set(attachment.fieldName, group);
  }
  return groups;
}

function baseValues(
  definition: TemplateDefinition,
  fiche: Fiche,
  prospect: Prospect | null,
  attachments: readonly FicheAttachment[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of definition.fields) {
    if (field.type === "file") {
      const group = attachments.filter((entry) => entry.fieldName === field.name);
      values[field.name] = group.map(attachmentDescriptor);
    } else {
      values[field.name] = fiche.data[field.name];
    }
  }
  for (const field of [
    "id",
    "createdAt",
    "templateKey",
    "templateVersion",
    "conversationId",
    "prospectId",
    "archivee",
  ]) {
    values[field] = metaValue(fiche, field);
  }
  for (const field of [
    "nom",
    "prenom",
    "nature",
    "email",
    "activite",
    "fonction",
    "detail",
    "origine",
    "lienId",
    "lienLabel",
  ]) {
    values[`prospect.${field}`] = prospectValue(prospect, field);
  }
  return values;
}

async function fileValue(
  mapping: WebhookFieldMapping,
  attachments: readonly FicheAttachment[],
  storage: AttachmentStorage,
): Promise<{ jsonValue: FileValue[]; parts: MultipartPart[] }> {
  if (attachments.length === 0) return { jsonValue: [], parts: [] };
  const jsonValue: FileValue[] = [];
  const parts: MultipartPart[] = [];
  for (const attachment of attachments) {
    if (mapping.fileMode === "multipart") {
      const file = await storage.read(attachment.storageKey);
      if (file === null) throw new UnprocessableError(`Fichier introuvable : ${attachment.id}`);
      parts.push({
        name: mapping.target,
        filename: attachment.originalName,
        contentType: attachment.mime,
        data: file.data,
      });
      continue;
    }
    if (mapping.fileMode === "base64") {
      const file = await storage.read(attachment.storageKey);
      if (file === null) throw new UnprocessableError(`Fichier introuvable : ${attachment.id}`);
      jsonValue.push({
        id: attachment.id,
        filename: attachment.originalName,
        mime: attachment.mime,
        sizeBytes: attachment.sizeBytes,
        base64: file.data.toString("base64"),
      });
      continue;
    }
    jsonValue.push(attachmentDescriptor(attachment));
  }
  return { jsonValue, parts };
}

function buildMultipart(
  fields: Record<string, unknown>,
  parts: readonly MultipartPart[],
): { body: Buffer; contentType: string; preview: string } {
  const boundary = `----onir-webhook-${randomBytes(12).toString("hex")}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${stringifyForText(value)}\r\n`,
      ),
    );
  }
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? "fichier"}"\r\nContent-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`,
      ),
      part.data,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
    preview: JSON.stringify({
      fields,
      files: parts.map((part) => ({
        name: part.name,
        filename: part.filename ?? null,
        contentType: part.contentType ?? null,
        sizeBytes: part.data.length,
      })),
    }),
  };
}

function maskHeaders(
  headers: Record<string, string>,
  endpoint: WebhookEndpoint,
): Array<{ name: string; value: string }> {
  const secretNames = new Set(
    endpoint.headers.filter((header) => header.secret).map((header) => header.name.toLowerCase()),
  );
  return Object.entries(headers).map(([name, value]) => ({
    name,
    value:
      WEBHOOK_SENSITIVE_HEADERS.has(name.toLowerCase()) || secretNames.has(name.toLowerCase())
        ? "••••"
        : value,
  }));
}

function maskUrlSecrets(url: URL, endpoint: WebhookEndpoint): string {
  const copy = new URL(url.toString());
  for (const param of endpoint.queryParams) {
    if (!param.secret) continue;
    if (copy.searchParams.has(param.name)) {
      copy.searchParams.set(param.name, "••••");
    }
  }
  return copy.toString();
}

function buildQueryAndPath(endpoint: WebhookEndpoint, values: Record<string, unknown>): URL {
  let url: URL;
  try {
    url = new URL(endpoint.url);
  } catch {
    throw new ValidationError("URL de webhook invalide");
  }
  url.pathname = replacePlaceholders(url.pathname, values, "url");
  for (const param of endpoint.queryParams) {
    url.searchParams.append(param.name, replacePlaceholders(param.value, values, "text"));
  }
  return url;
}

function buildCookedHeaders(
  endpoint: WebhookEndpoint,
  values: Record<string, unknown>,
  contentType: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of endpoint.headers) {
    headers[header.name] = replacePlaceholders(header.value, values, "text");
  }
  if (contentType !== null) {
    const existing = Object.keys(headers).find((name) => name.toLowerCase() === "content-type");
    if (existing !== undefined) delete headers[existing];
    headers["Content-Type"] = contentType;
  }
  return headers;
}

/**
 * Construit une requête HTTP complète à partir d'une fiche et de son snapshot.
 * Les valeurs sont figées dans le snapshot d'audit, mais l'authentification est
 * appliquée au moment de l'envoi par le `WebhookSender`.
 */
export async function buildWebhookRequest(
  deps: BuildWebhookRequestDependencies,
  endpoint: WebhookEndpoint,
  fiche: Fiche,
): Promise<BuiltWebhookRequest> {
  const template = await deps.templates.findVersion(
    endpoint.organizationId,
    fiche.templateKey,
    fiche.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Version du modèle de raisonnement introuvable");
  }
  if (fiche.templateKey !== endpoint.templateKey) {
    throw new UnprocessableError("La fiche n'appartient pas au modèle du webhook");
  }

  const prospect =
    fiche.prospectId === null
      ? null
      : await deps.prospects.findById(endpoint.organizationId, fiche.prospectId);
  const attachments = await deps.attachments.listByFiche(endpoint.organizationId, fiche.id);
  const groups = fieldGroups(attachments);
  const values = baseValues(template.definition, fiche, prospect, attachments);
  const fields: Record<string, unknown> = {};
  const multipartParts: MultipartPart[] = [];
  let attachmentCount = 0;

  for (const mapping of endpoint.fieldMappings) {
    let value: unknown;
    if (mapping.source === "attachment") {
      const group = groups.get(mapping.field) ?? [];
      if (group.length === 0 && mapping.required) {
        throw new UnprocessableError(`Pièce jointe requise manquante : ${mapping.field}`);
      }
      if (group.length > 0) {
        const encoded = await fileValue(mapping, group, deps.storage);
        attachmentCount += group.length;
        multipartParts.push(...encoded.parts);
        value = mapping.fileMode === "multipart" ? undefined : encoded.jsonValue;
      }
    } else if (mapping.source === "meta") {
      value = metaValue(fiche, mapping.field);
    } else if (mapping.source === "prospect") {
      value = prospectValue(prospect, mapping.field);
    } else {
      value = fiche.data[mapping.field];
    }

    if (
      mapping.source === "attachment" &&
      mapping.fileMode === "multipart" &&
      (groups.get(mapping.field)?.length ?? 0) > 0
    ) {
      continue;
    }

    if (isEmpty(value)) {
      if (mapping.required) {
        throw new UnprocessableError(`Champ requis manquant : ${mapping.field}`);
      }
      continue;
    }
    if (value !== undefined) {
      setPath(fields, mapping.target, value);
      values[mapping.target] = value;
    }
  }

  if (endpoint.httpMethod === "GET" || endpoint.httpMethod === "HEAD") {
    const url = buildQueryAndPath(endpoint, values);
    const headers = buildCookedHeaders(endpoint, values, null);
    const emptyBody = Buffer.alloc(0);
    return {
      request: {
        method: endpoint.httpMethod,
        url: url.toString(),
        headers,
        body: emptyBody,
        contentType: null,
        timeoutMs: endpoint.timeoutMs,
        followRedirects: endpoint.followRedirects,
        tlsVerify: endpoint.tlsVerify,
        allowPrivateNetwork: endpoint.allowPrivateNetwork,
      },
      snapshot: {
        method: endpoint.httpMethod,
        url: maskUrlSecrets(url, endpoint),
        headers: maskHeaders(headers, endpoint),
        bodyPreview: "",
        bodyBytes: 0,
        attachmentCount,
      },
      attachmentCount,
    };
  }

  let body: Buffer;
  let contentType: string;
  let bodyPreview: string;
  if (endpoint.bodyMode === "multipart") {
    const built = buildMultipart(fields, multipartParts);
    body = built.body;
    contentType = built.contentType;
    bodyPreview = built.preview;
  } else if (endpoint.bodyMode === "form_urlencoded") {
    const bodyText =
      endpoint.bodyTemplate.trim() === ""
        ? new URLSearchParams(
            Object.entries(fields).flatMap(([name, value]) =>
              value === undefined ? [] : [[name, stringifyForText(value)] as [string, string]],
            ),
          ).toString()
        : replacePlaceholders(endpoint.bodyTemplate, values, "text");
    body = Buffer.from(bodyText, "utf8");
    contentType = "application/x-www-form-urlencoded";
    bodyPreview = bodyText;
  } else if (endpoint.bodyMode === "json") {
    const bodyText =
      endpoint.bodyTemplate.trim() === ""
        ? JSON.stringify(fields)
        : replacePlaceholders(endpoint.bodyTemplate, values, "json");
    body = Buffer.from(bodyText, "utf8");
    contentType = "application/json; charset=utf-8";
    bodyPreview = bodyText;
  } else {
    const bodyText =
      endpoint.bodyTemplate.trim() === ""
        ? JSON.stringify(fields)
        : replacePlaceholders(endpoint.bodyTemplate, values, "text");
    body = Buffer.from(bodyText, "utf8");
    const configured = endpoint.headers.find(
      (header) => header.name.toLowerCase() === "content-type",
    );
    contentType = configured?.value.trim() || "text/plain; charset=utf-8";
    bodyPreview = bodyText;
  }

  if (body.length > WEBHOOK_LIMITS.bodyMaxBytes) {
    throw new UnprocessableError(
      `Corps de webhook trop volumineux (${WEBHOOK_LIMITS.bodyMaxBytes} octets maximum)`,
    );
  }

  const url = buildQueryAndPath(endpoint, values);
  const headers = buildCookedHeaders(endpoint, values, contentType);
  return {
    request: {
      method: endpoint.httpMethod,
      url: url.toString(),
      headers,
      body,
      contentType,
      timeoutMs: endpoint.timeoutMs,
      followRedirects: endpoint.followRedirects,
      tlsVerify: endpoint.tlsVerify,
      allowPrivateNetwork: endpoint.allowPrivateNetwork,
    },
    snapshot: {
      method: endpoint.httpMethod,
      url: maskUrlSecrets(url, endpoint),
      headers: maskHeaders(headers, endpoint),
      bodyPreview: bodyPreview.slice(0, 4000),
      bodyBytes: body.length,
      attachmentCount,
    },
    attachmentCount,
  };
}

/** Champs de modèle exposés à la configuration UI. */
export function templateFieldCatalog(
  fields: readonly TemplateField[],
): Array<{ name: string; label: string; type: string }> {
  return fields.map((field) => ({ name: field.name, label: field.label, type: field.type }));
}
