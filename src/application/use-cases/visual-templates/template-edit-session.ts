import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { TemplateEditSessionRepository } from "@/application/ports/template-edit-session-repository";
import { applyTemplateEditProposal } from "@/domain/template-edit-proposal";
import {
  listTemplateEditCandidates,
  resolveTemplateEditTarget,
} from "@/domain/template-edit-resolver";
import {
  appendTemplateEditMessage,
  createTemplateEditMessage,
  createTemplateEditSessionState,
  TEMPLATE_EDIT_MESSAGE_MAX,
  type TemplateEditSession,
  type TemplateEditSessionState,
} from "@/domain/template-edit-session";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import { generateTemplateEditProposal } from "./generate-template-edit-proposal";
import { rankTemplateEditCandidates } from "./rank-template-edit-candidates";

export type TemplateEditSessionContext = {
  linkId: string;
  surface: "page" | "widget";
  templateId: string;
  templateVersion: string;
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  workingParams: TemplateParamValues;
};

export type TemplateEditSessionDependencies = {
  sessions: TemplateEditSessionRepository;
  aiFactory: AiClientFactory;
};

function cleanMessage(value: unknown): string {
  const message = typeof value === "string" ? value.trim() : "";
  if (message === "") throw new ValidationError("Message requis");
  return message.slice(0, TEMPLATE_EDIT_MESSAGE_MAX);
}

function candidateId(candidate: TemplateEditCandidate): string {
  return `${candidate.collection}:${candidate.itemId}`;
}

export async function startTemplateEditSession(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  context: TemplateEditSessionContext,
): Promise<TemplateEditSession> {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  const active = await deps.sessions.findActive(
    organizationId,
    context.linkId,
    context.surface,
    actor.id,
  );
  if (active !== null) return active;
  return deps.sessions.create({
    organizationId,
    linkId: context.linkId,
    createdBy: actor.id,
    surface: context.surface,
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    state: {
      ...createTemplateEditSessionState(context.workingParams),
      selection: null,
    },
  });
}

export async function getTemplateEditSession(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  linkId: string,
  sessionId: string,
): Promise<TemplateEditSession> {
  assertCan(actor, "links:update");
  const session = await deps.sessions.find(organizationOf(actor), linkId, sessionId);
  if (session === null) throw new NotFoundError("Session d’édition introuvable");
  return session;
}

export async function archiveTemplateEditSession(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  linkId: string,
  sessionId: string,
): Promise<void> {
  assertCan(actor, "links:update");
  const archived = await deps.sessions.archive(organizationOf(actor), linkId, sessionId);
  if (!archived) throw new NotFoundError("Session d’édition introuvable");
}

export async function continueTemplateEditSession(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  context: TemplateEditSessionContext,
  sessionId: string,
  input: unknown,
): Promise<TemplateEditSession> {
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");
  const session = await deps.sessions.find(organizationOf(actor), context.linkId, sessionId);
  if (session === null) throw new NotFoundError("Session d’édition introuvable");

  const body =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const message = cleanMessage(body.message);
  const selection =
    typeof body.selection === "string" && body.selection.trim() !== ""
      ? body.selection.trim()
      : session.state.selection;
  const workingParams =
    body.params !== undefined ? (body.params as TemplateParamValues) : session.state.workingParams;

  let state: TemplateEditSessionState = appendTemplateEditMessage(
    { ...session.state, workingParams, selection },
    createTemplateEditMessage("user", message),
  );

  const resolved = resolveTemplateEditTarget({
    request: message,
    currentPageId: null,
    selection: selection === null ? null : { regionId: selection },
    editor: context.editor,
    values: workingParams,
  });
  const candidates =
    resolved.candidates.length > 0
      ? resolved.candidates
      : listTemplateEditCandidates({
          request: message,
          currentPageId: null,
          selection: selection === null ? null : { regionId: selection },
          editor: context.editor,
          values: workingParams,
        });

  if (candidates.length === 0) {
    state = appendTemplateEditMessage(
      { ...state, pendingProposal: null, pendingCandidate: null },
      createTemplateEditMessage(
        "assistant",
        "Je n’ai trouvé aucune cible éditable correspondant à cette demande. Précisez la page ou l’élément à modifier.",
      ),
    );
    const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
    if (saved === null) throw new NotFoundError("Session d’édition introuvable");
    return saved;
  }

  const decision = await rankTemplateEditCandidates({ aiFactory: deps.aiFactory }, actor, {
    request: message,
    page: resolved.page,
    candidates,
  });

  if (decision.status === "ambiguous") {
    state = appendTemplateEditMessage(
      { ...state, pendingProposal: null, pendingCandidate: null },
      createTemplateEditMessage("assistant", decision.question, {
        candidates: decision.candidates,
      }),
    );
  } else if (decision.status === "not_found") {
    state = appendTemplateEditMessage(
      { ...state, pendingProposal: null, pendingCandidate: null },
      createTemplateEditMessage(
        "assistant",
        "Je n’ai pas trouvé de cible fiable. Précisez la page ou l’élément.",
      ),
    );
  } else {
    const candidate = decision.candidate;
    const generated = await generateTemplateEditProposal({ aiFactory: deps.aiFactory }, actor, {
      request: message,
      page: resolved.page,
      candidate,
      editor: context.editor,
      schema: context.schema,
      values: workingParams,
    });
    state = appendTemplateEditMessage(
      {
        ...state,
        pendingProposal: generated.proposal,
        pendingCandidate: candidate,
      },
      createTemplateEditMessage(
        "assistant",
        `J’ai trouvé « ${candidate.label} ». Voici la modification proposée.`,
        {
          proposal: generated.proposal,
          candidate,
        },
      ),
    );
  }

  const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
  if (saved === null) throw new NotFoundError("Session d’édition introuvable");
  return saved;
}

export async function applyTemplateEditSessionProposal(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  context: TemplateEditSessionContext,
  sessionId: string,
): Promise<{ session: TemplateEditSession; values: TemplateParamValues }> {
  assertCan(actor, "links:update");
  const session = await deps.sessions.find(organizationOf(actor), context.linkId, sessionId);
  if (session === null) throw new NotFoundError("Session d’édition introuvable");
  const proposal = session.state.pendingProposal;
  if (proposal === null) throw new ValidationError("Aucune proposition en attente");

  const result = applyTemplateEditProposal({
    editor: context.editor,
    schema: context.schema,
    values: session.state.workingParams,
    proposal,
  });
  if (!result.ok) {
    throw new ValidationError(
      result.errors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
    );
  }

  const state = appendTemplateEditMessage(
    {
      ...session.state,
      workingParams: result.values,
      pendingProposal: null,
      pendingCandidate: null,
    },
    createTemplateEditMessage(
      "assistant",
      "C’est appliqué au brouillon. Enregistrez pour persister la modification.",
    ),
  );
  const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
  if (saved === null) throw new NotFoundError("Session d’édition introuvable");
  return { session: saved, values: result.values };
}

export { candidateId };
