import { NextResponse } from "next/server";
import { ForbiddenError, ValidationError } from "@/application/errors";
import type { TemplateDataBindingFields } from "@/application/ports/template-data-binding-repository";
import type {
  TemplateDataBinding,
  TemplateDataChildQuery,
  TemplateDataQueryInput,
} from "@/domain/template-data";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject, stringField } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";
import { assertTemplateQuery } from "./_lib/parse-binding";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integerField(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = body[key];
  if (raw === undefined) return fallback;
  const value = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${key} : entier entre ${min} et ${max}`);
  }
  return value;
}

function parseChildren(raw: unknown): TemplateDataChildQuery[] {
  if (!Array.isArray(raw) || raw.length > 3) throw new ValidationError("children : 0 à 3 entrées");
  return raw.map((entry, index) => {
    const child = record(entry);
    const path = typeof child.path === "string" ? child.path.trim() : "";
    const queryText = typeof child.query_text === "string" ? child.query_text.trim() : "";
    const foreignKey = typeof child.foreign_key === "string" ? child.foreign_key.trim() : "";
    if (path === "" || path.length > 64)
      throw new ValidationError(`children[${index}].path invalide`);
    if (foreignKey === "" || foreignKey.length > 64)
      throw new ValidationError(`children[${index}].foreign_key invalide`);
    assertTemplateQuery(queryText);
    return { path, queryText, foreignKey };
  });
}

function parseQueryInputs(
  raw: unknown,
  inputKeys: Set<string>,
  paramKeys: Set<string>,
): TemplateDataQueryInput[] {
  if (!Array.isArray(raw) || raw.length > 10)
    throw new ValidationError("query_inputs : 0 à 10 entrées");
  const seen = new Set<number>();
  return raw.map((entry, index) => {
    const item = record(entry);
    const number = typeof item.index === "number" ? item.index : Number.NaN;
    const from = typeof item.from === "string" ? item.from : "";
    if (!Number.isInteger(number) || number < 1 || number > 10 || seen.has(number)) {
      throw new ValidationError(`query_inputs[${index}].index invalide ou dupliqué`);
    }
    seen.add(number);
    const [kind, key] = from.split(":", 2);
    if (kind === "input" && key !== undefined && inputKeys.has(key)) return { index: number, from };
    if (kind === "link" && key !== undefined && paramKeys.has(key)) return { index: number, from };
    if (from === "system:locale") return { index: number, from };
    throw new ValidationError(`query_inputs[${index}].from non autorisé`);
  });
}

/** GET — contrats et bindings par défaut de l'organisation pour une version. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:read");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id } = await context.params;
    const url = new URL(request.url);
    const versionName = url.searchParams.get("version");
    if (versionName === null) throw new ValidationError("version requise");
    const templates = pgVisualTemplateRepository(getPool());
    const version = await templates.findVersion(id, versionName);
    if (version === null) throw new ValidationError("Version inconnue");
    const repo = pgTemplateDataBindingRepository(getPool());
    const bindings = await repo.listForVersion(actor.organizationId, version.id);
    const withUsage = await Promise.all(
      bindings.map(async (binding) => ({
        ...binding,
        usageCount: await repo.countLinkUsages(binding.id),
      })),
    );
    return NextResponse.json({
      version: { id: version.id, version: version.version },
      contracts: version.manifest.dataContracts ?? [],
      bindings: withUsage,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST — crée une variante (vide ou dupliquée) pour un contrat. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const versionName = stringField(body, "version");
    const contractKey = stringField(body, "contractKey");
    const name = stringField(body, "name");
    if (versionName === undefined || contractKey === undefined || name === undefined) {
      throw new ValidationError("version, contractKey et name requis");
    }
    const version = await pgVisualTemplateRepository(getPool()).findVersion(id, versionName);
    if (version === null) throw new ValidationError("Version inconnue");
    const contract = (version.manifest.dataContracts ?? []).find(
      (entry) => entry.key === contractKey,
    );
    if (contract === undefined) throw new ValidationError("Contrat non déclaré par cette version");
    if (name.trim() === "" || name.trim().length > 60) {
      throw new ValidationError("name : 1 à 60 caractères");
    }

    const repo = pgTemplateDataBindingRepository(getPool());
    const duplicateFromId = stringField(body, "duplicateFromId");
    let fields: TemplateDataBindingFields;
    if (duplicateFromId !== undefined) {
      const source = await repo.findById(actor.organizationId, duplicateFromId);
      if (
        source === null ||
        source.templateVersionId !== version.id ||
        source.contractKey !== contractKey
      ) {
        throw new ValidationError("Binding à dupliquer introuvable pour ce contrat");
      }
      fields = {
        name: name.trim(),
        queryText: source.queryText,
        rootPath: source.rootPath,
        rootKey: source.rootKey,
        children: source.children,
        queryInputs: source.queryInputs,
        invalidateOn: source.invalidateOn,
        cacheTtlSeconds: source.cacheTtlSeconds,
        maxRows: source.maxRows,
        enabled: source.enabled,
      };
    } else {
      const rootPath =
        Object.entries(contract.schema.properties ?? {}).find(
          ([, node]) => node.type === "array",
        )?.[0] ?? "items";
      fields = {
        name: name.trim(),
        queryText: "",
        rootPath,
        rootKey: "id",
        children: [],
        queryInputs: [],
        invalidateOn: "none" as const,
        cacheTtlSeconds: 300,
        maxRows: 200,
        enabled: false,
      };
    }

    let binding: TemplateDataBinding;
    try {
      binding = await repo.create({
        ...fields,
        organizationId: actor.organizationId,
        templateVersionId: version.id,
        contractKey,
        actorId: actor.id,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ValidationError("Ce nom de source est déjà utilisé pour ce contrat");
      }
      throw error;
    }
    return NextResponse.json({ binding }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT — crée ou met à jour le binding par défaut d'un contrat. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const versionName = stringField(body, "version");
    const contractKey = stringField(body, "contractKey");
    if (versionName === undefined || contractKey === undefined) {
      throw new ValidationError("version et contractKey requis");
    }
    const repo = pgVisualTemplateRepository(getPool());
    const version = await repo.findVersion(id, versionName);
    if (version === null) throw new ValidationError("Version inconnue");
    const contract = (version.manifest.dataContracts ?? []).find(
      (entry) => entry.key === contractKey,
    );
    if (contract === undefined) throw new ValidationError("Contrat non déclaré par cette version");

    const queryText = (stringField(body, "queryText") ?? "").trim();
    assertTemplateQuery(queryText);
    const rootPath = (stringField(body, "rootPath") ?? "").trim();
    if (rootPath === "" || rootPath.length > 64) throw new ValidationError("rootPath invalide");
    if (
      contract.schema.type !== "object" ||
      contract.schema.properties?.[rootPath]?.type !== "array"
    ) {
      throw new ValidationError("rootPath doit désigner un tableau du contrat");
    }
    const rootKey = (stringField(body, "rootKey") ?? "id").trim();
    if (rootKey === "" || rootKey.length > 64) throw new ValidationError("rootKey invalide");
    const children = parseChildren(body.children ?? []);
    const queryInputs = parseQueryInputs(
      body.queryInputs ?? [],
      new Set(contract.inputs.map((input) => input.key)),
      new Set((version.manifest.params ?? []).map((param) => param.key)),
    );
    const invalidateOn = stringField(body, "invalidateOn") ?? "none";
    if (!["none", "medias", "connaissances", "prospects"].includes(invalidateOn)) {
      throw new ValidationError("invalidateOn invalide");
    }
    const cacheTtlSeconds = integerField(body, "cacheTtlSeconds", 300, 0, 3600);
    const maxRows = integerField(body, "maxRows", 200, 1, 1000);
    const enabled = body.enabled === true;

    const binding = await pgTemplateDataBindingRepository(getPool()).upsertDefault({
      organizationId: actor.organizationId,
      templateVersionId: version.id,
      contractKey,
      queryText,
      rootPath,
      rootKey,
      children,
      queryInputs,
      invalidateOn: invalidateOn as "none" | "medias" | "connaissances" | "prospects",
      cacheTtlSeconds,
      maxRows,
      enabled,
      actorId: actor.id,
    });
    return NextResponse.json({ binding });
  } catch (error) {
    return errorResponse(error);
  }
}
