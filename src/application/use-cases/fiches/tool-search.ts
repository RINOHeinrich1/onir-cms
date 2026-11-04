import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatSearchSessionRepository } from "@/application/ports/chat-search-session-repository";
import type {
  FicheToolFilters,
  FicheToolRepository,
  FicheToolRow,
  FicheToolScope,
} from "@/application/ports/fiche-tool-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  DEFAULT_LIMIT,
  type FicheCountToolResult,
  type FicheSearchToolConfig,
  type FicheSearchToolResult,
  type FicheToolResultItem,
  type FicheTypeToolResult,
  isFicheSortModeExecutable,
  MAX_LIMIT,
  MAX_SESSION_RESULTS,
  SESSION_TTL_MINUTES,
} from "@/domain/fiche-search-tool";
import {
  type SearchableFicheDefinition,
  type ValidatedFicheSearchRequest,
  validateSearchRequest,
} from "@/domain/fiche-search-validation";
import { projectFicheToToolFields } from "@/domain/tool-projection";

export const FICHE_TOOL_NAMES = [
  "search_fiches",
  "continue_search",
  "get_fiche",
  "list_fiche_types",
  "count_fiches",
] as const;

export type FicheToolName = (typeof FICHE_TOOL_NAMES)[number];

export type FicheToolDependencies = {
  fiches: FicheToolRepository;
  sessions: ChatSearchSessionRepository;
  /** Horloge injectable (tests déterministes de TTL). */
  now?: () => Date;
  logger?: (message: string) => void;
};

/**
 * Contexte fourni par l'hôte : jamais par le modèle. `conversationId` sert de
 * graine de rotation et de clé de session.
 */
export type FicheToolContext = {
  organizationId: string;
  chatLinkId: string;
  conversationId: string;
  config: FicheSearchToolConfig;
  /** Snapshots des fiches de collecte du chatbot (`config.fiches`). */
  fiches: SearchableFicheDefinition[];
  deps: FicheToolDependencies;
};

function definitionsByType(
  fiches: readonly SearchableFicheDefinition[],
): Record<string, SearchableFicheDefinition> {
  const result: Record<string, SearchableFicheDefinition> = {};
  for (const fiche of fiches) result[fiche.key] = fiche;
  return result;
}

function templateDefinitionsByType(
  fiches: readonly SearchableFicheDefinition[],
): Record<string, TemplateDefinition> {
  const result: Record<string, TemplateDefinition> = {};
  for (const fiche of fiches) {
    result[fiche.key] = {
      key: fiche.key,
      label: fiche.label,
      description: "",
      systemPrompt: "",
      fields: fiche.fields,
      renderTemplate: "",
      ...(fiche.statuses === undefined ? {} : { statuses: fiche.statuses }),
    };
  }
  return result;
}

function effectiveFicheTypes(
  config: FicheSearchToolConfig,
  definitions: Readonly<Record<string, SearchableFicheDefinition>>,
): string[] {
  return config.ficheTypes.length > 0 ? config.ficheTypes : Object.keys(definitions);
}

function assertSortExecutable(config: FicheSearchToolConfig): void {
  if (!isFicheSortModeExecutable(config.sortMode)) {
    throw new ValidationError("Tri relevance indisponible (sort_mode_unavailable)");
  }
}

/**
 * Un statut fixe référencé doit exister et ne pas être archivé dans au moins
 * un type interrogé ; sinon la configuration de l'outil est invalide.
 */
function assertFixedStatusesAvailable(
  config: FicheSearchToolConfig,
  definitions: Readonly<Record<string, SearchableFicheDefinition>>,
  ficheTypes: readonly string[],
): void {
  if (config.statusMode === "all" || config.fixedStatusKeys.length === 0) return;
  for (const key of config.fixedStatusKeys) {
    const available = ficheTypes.some((type) => {
      const status = definitions[type]?.statuses?.find((entry) => entry.key === key);
      return status !== undefined && status.archivedAt === null;
    });
    if (!available) {
      throw new ValidationError(
        `Statut fixe indisponible pour ce chatbot : ${key} (statut retiré ou archivé)`,
      );
    }
  }
}

function toResultItem(row: FicheToolRow, statusMode: FicheSearchToolConfig["statusMode"]) {
  const fields = row.definition === null ? [] : projectFicheToToolFields(row.definition, row.data);
  const item: FicheToolResultItem = { ficheId: row.id, fields };
  if (statusMode === "internal_filter" && row.qualificationStatusKey !== null) {
    item.statusKey = row.qualificationStatusKey;
  }
  return item;
}

function scopeFrom(
  context: FicheToolContext,
  overrides: Partial<FicheToolScope> = {},
): FicheToolScope {
  return {
    organizationId: context.organizationId,
    chatLinkId: context.chatLinkId,
    scope: overrides.scope ?? context.config.scope,
  };
}

function filtersFrom(
  context: FicheToolContext,
  request: ValidatedFicheSearchRequest,
  definitions: Record<string, TemplateDefinition>,
): FicheToolFilters & { definitions: Record<string, TemplateDefinition> } {
  return {
    ...scopeFrom(context),
    ficheTypes: request.ficheTypes,
    conditions: request.conditions,
    query: request.query,
    createdFrom: request.createdFrom,
    createdTo: request.createdTo,
    statusMode: context.config.statusMode,
    fixedStatusKeys: context.config.fixedStatusKeys,
    definitions,
  };
}

async function loadPage(
  deps: FicheToolDependencies,
  scope: FicheToolScope & {
    ficheTypes: string[];
    statusMode: FicheSearchToolConfig["statusMode"];
    fixedStatusKeys: string[];
  },
  ids: readonly string[],
): Promise<FicheToolResultItem[]> {
  const rows = await Promise.all(
    ids.map((ficheId) =>
      deps.fiches.findScopedById({
        ...scope,
        ficheId,
      }),
    ),
  );
  return rows
    .filter((row): row is FicheToolRow => row !== null)
    .map((row) => toResultItem(row, scope.statusMode));
}

async function searchFichesTool(
  context: FicheToolContext,
  args: unknown,
): Promise<FicheSearchToolResult> {
  const definitions = definitionsByType(context.fiches);
  assertSortExecutable(context.config);
  const validation = validateSearchRequest(args, definitions, context.config);
  if (!validation.ok) throw new ValidationError(validation.errors.join(" ; "));
  const request = validation.value;
  assertFixedStatusesAvailable(context.config, definitions, request.ficheTypes);

  const criteria = {
    ...filtersFrom(context, request, templateDefinitionsByType(context.fiches)),
    sortMode: context.config.sortMode,
    conversationId: context.conversationId,
    limit: request.limit,
    offset: 0,
  };
  const result = await context.deps.fiches.searchScoped(criteria);
  if (result.total > MAX_SESSION_RESULTS) {
    throw new ValidationError(
      `Trop de résultats (${result.total}) : affinez vos critères (maximum ${MAX_SESSION_RESULTS} par recherche)`,
    );
  }

  const now = context.deps.now?.() ?? new Date();
  await context.deps.sessions.purgeExpired(now);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();
  await context.deps.sessions.create({
    organizationId: context.organizationId,
    chatLinkId: context.chatLinkId,
    conversationId: context.conversationId,
    criteria: {
      query: request.query,
      ficheTypes: request.ficheTypes,
      conditions: request.conditions,
      createdFrom: request.createdFrom,
      createdTo: request.createdTo,
      statusMode: context.config.statusMode,
      fixedStatusKeys: context.config.fixedStatusKeys,
      sortMode: context.config.sortMode,
      scope: context.config.scope,
    },
    orderedFicheIds: result.ids,
    total: result.total,
    // La première page est déjà consommée par `search_fiches`.
    offset: Math.min(request.limit, result.total),
    expiresAt,
  });

  const pageIds = result.ids.slice(0, request.limit);
  const items = await loadPage(
    context.deps,
    {
      ...scopeFrom(context),
      ficheTypes: request.ficheTypes,
      statusMode: context.config.statusMode,
      fixedStatusKeys: context.config.fixedStatusKeys,
    },
    pageIds,
  );
  return {
    items,
    total: result.total,
    hasMore: request.limit < result.total,
    page: { limit: request.limit, offset: 0 },
  };
}

function parseContinueLimit(args: unknown): number {
  if (args === undefined || args === null) return DEFAULT_LIMIT;
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new ValidationError("continue_search : objet attendu");
  }
  const record = args as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => key !== "limit");
  if (unexpected.length > 0) {
    throw new ValidationError(
      "continue_search ne modifie pas les critères : utilisez search_fiches",
    );
  }
  if (record.limit === undefined) return DEFAULT_LIMIT;
  if (
    typeof record.limit !== "number" ||
    !Number.isInteger(record.limit) ||
    record.limit < 1 ||
    record.limit > MAX_LIMIT
  ) {
    throw new ValidationError(`limit : entier entre 1 et ${MAX_LIMIT} attendu`);
  }
  return record.limit;
}

async function continueSearchTool(
  context: FicheToolContext,
  args: unknown,
): Promise<FicheSearchToolResult> {
  assertSortExecutable(context.config);
  const limit = parseContinueLimit(args);
  const now = context.deps.now?.() ?? new Date();
  const session = await context.deps.sessions.latestActive({
    organizationId: context.organizationId,
    chatLinkId: context.chatLinkId,
    conversationId: context.conversationId,
    now,
  });
  if (session === null) {
    throw new ValidationError("Aucune recherche active : relancez search_fiches");
  }

  const offset = session.offset;
  const pageIds = session.orderedFicheIds.slice(offset, offset + limit);
  const items = await loadPage(
    context.deps,
    {
      ...scopeFrom(context, { scope: session.criteria.scope }),
      ficheTypes: session.criteria.ficheTypes,
      statusMode: session.criteria.statusMode,
      fixedStatusKeys: session.criteria.fixedStatusKeys,
    },
    pageIds,
  );
  const nextOffset = Math.min(offset + limit, session.total);
  await context.deps.sessions.updateOffset({
    organizationId: context.organizationId,
    chatLinkId: context.chatLinkId,
    conversationId: context.conversationId,
    sessionId: session.id,
    offset: nextOffset,
  });
  return {
    items,
    total: session.total,
    hasMore: nextOffset < session.total,
    page: { limit, offset },
  };
}

async function getFicheTool(
  context: FicheToolContext,
  args: unknown,
): Promise<FicheToolResultItem> {
  assertSortExecutable(context.config);
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new ValidationError("get_fiche : objet attendu");
  }
  const rawId = (args as Record<string, unknown>).ficheId;
  const ficheId = typeof rawId === "string" ? rawId.trim() : "";
  if (ficheId === "") throw new ValidationError("get_fiche : ficheId obligatoire");

  const definitions = definitionsByType(context.fiches);
  const ficheTypes = effectiveFicheTypes(context.config, definitions);
  assertFixedStatusesAvailable(context.config, definitions, ficheTypes);
  const row = await context.deps.fiches.findScopedById({
    ...scopeFrom(context),
    ficheTypes,
    statusMode: context.config.statusMode,
    fixedStatusKeys: context.config.fixedStatusKeys,
    ficheId,
  });
  if (row === null) throw new NotFoundError("Fiche introuvable");
  return toResultItem(row, context.config.statusMode);
}

function listFicheTypesTool(context: FicheToolContext): FicheTypeToolResult[] {
  return context.fiches.map((fiche) => ({ key: fiche.key, label: fiche.label }));
}

async function countFichesTool(
  context: FicheToolContext,
  args: unknown,
): Promise<FicheCountToolResult> {
  const definitions = definitionsByType(context.fiches);
  assertSortExecutable(context.config);
  const validation = validateSearchRequest(args, definitions, context.config);
  if (!validation.ok) throw new ValidationError(validation.errors.join(" ; "));
  const request = validation.value;
  assertFixedStatusesAvailable(context.config, definitions, request.ficheTypes);
  const total = await context.deps.fiches.countScoped(
    filtersFrom(context, request, templateDefinitionsByType(context.fiches)),
  );
  return { total };
}

function short(value: string, max = 64): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Registre unique et allowlist des cinq outils en lecture seule.
 * Le journal ne contient jamais les valeurs des critères.
 */
export async function executeFicheTool(
  context: FicheToolContext,
  tool: string,
  args: unknown,
): Promise<
  FicheSearchToolResult | FicheCountToolResult | FicheTypeToolResult[] | FicheToolResultItem
> {
  const logger = context.deps.logger ?? ((message: string) => console.info(message));
  logger(
    `[fiche-tools] ${short(tool, 32)} org=${short(context.organizationId)} link=${short(
      context.chatLinkId,
    )} conv=${short(context.conversationId)}`,
  );
  switch (tool) {
    case "search_fiches":
      return searchFichesTool(context, args);
    case "continue_search":
      return continueSearchTool(context, args);
    case "get_fiche":
      return getFicheTool(context, args);
    case "list_fiche_types":
      return listFicheTypesTool(context);
    case "count_fiches":
      return countFichesTool(context, args);
    default:
      throw new ValidationError(`Outil inconnu : ${tool}`);
  }
}
