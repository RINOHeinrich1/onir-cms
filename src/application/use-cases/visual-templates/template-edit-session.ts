import { createHash } from "node:crypto";
import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { TemplateEditAuditRepository } from "@/application/ports/template-edit-audit-repository";
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
  audit: TemplateEditAuditRepository;
};

function hashValues(values: TemplateParamValues): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

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
  if (active !== null) {
    await deps.audit.record({
      organizationId,
      linkId: context.linkId,
      sessionId: active.id,
      actorId: actor.id,
      event: "session_resumed",
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      metadata: { surface: context.surface },
    });
    return active;
  }
  const created = await deps.sessions.create({
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
  await deps.audit.record({
    organizationId,
    linkId: context.linkId,
    sessionId: created.id,
    actorId: actor.id,
    event: "session_started",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    beforeHash: hashValues(context.workingParams),
    metadata: { surface: context.surface },
  });
  return created;
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

  const userMessage = createTemplateEditMessage("user", message);
  let state: TemplateEditSessionState = appendTemplateEditMessage(
    { ...session.state, workingParams, selection },
    userMessage,
  );
  await deps.audit.record({
    organizationId: organizationOf(actor),
    linkId: context.linkId,
    sessionId,
    messageId: userMessage.id,
    actorId: actor.id,
    event: "user_message",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    content: message,
    beforeHash: hashValues(workingParams),
    metadata: { selection, surface: context.surface },
  });

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
    const reply = createTemplateEditMessage(
      "assistant",
      "Je n’ai trouvé aucune cible éditable correspondant à cette demande. Précisez la page ou l’élément à modifier.",
    );
    state = appendTemplateEditMessage(
      { ...state, pendingProposal: null, pendingCandidate: null },
      reply,
    );
    await deps.audit.record({
      organizationId: organizationOf(actor),
      linkId: context.linkId,
      sessionId,
      messageId: reply.id,
      actorId: actor.id,
      event: "not_found",
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      content: reply.content,
      beforeHash: hashValues(workingParams),
      metadata: { selection },
    });
    const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
    if (saved === null) throw new NotFoundError("Session d’édition introuvable");
    return saved;
  }

  try {
    const decision = await rankTemplateEditCandidates({ aiFactory: deps.aiFactory }, actor, {
      request: message,
      page: resolved.page,
      candidates,
    });

    if (decision.status === "ambiguous") {
      const reply = createTemplateEditMessage("assistant", decision.question, {
        candidates: decision.candidates,
      });
      state = appendTemplateEditMessage(
        { ...state, pendingProposal: null, pendingCandidate: null },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        actorId: actor.id,
        event: "ambiguous",
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        beforeHash: hashValues(workingParams),
        metadata: {
          selection,
          candidates: decision.candidates.map(candidateId),
        },
      });
    } else if (decision.status === "not_found") {
      const reply = createTemplateEditMessage(
        "assistant",
        "Je n’ai pas trouvé de cible fiable. Précisez la page ou l’élément.",
      );
      state = appendTemplateEditMessage(
        { ...state, pendingProposal: null, pendingCandidate: null },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        actorId: actor.id,
        event: "not_found",
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        beforeHash: hashValues(workingParams),
        metadata: { selection },
      });
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
      const reply = createTemplateEditMessage(
        "assistant",
        `J’ai trouvé « ${candidate.label} ». Voici la modification proposée.`,
        {
          proposal: generated.proposal,
          candidate,
        },
      );
      state = appendTemplateEditMessage(
        {
          ...state,
          pendingProposal: generated.proposal,
          pendingCandidate: candidate,
        },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        actorId: actor.id,
        event: "proposal_created",
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        candidateId: candidateId(candidate),
        content: reply.content,
        operations: generated.proposal.operations,
        warnings: generated.warnings,
        beforeHash: hashValues(workingParams),
        metadata: { surface: context.surface, selection },
      });
    }
  } catch (error) {
    const detail =
      error instanceof Error && error.message !== "" ? error.message : "Erreur inconnue";
    const reply = createTemplateEditMessage(
      "assistant",
      `Je n’ai pas pu préparer la modification : ${detail}`,
    );
    state = appendTemplateEditMessage(
      { ...state, pendingProposal: null, pendingCandidate: null },
      reply,
    );
    await deps.audit.record({
      organizationId: organizationOf(actor),
      linkId: context.linkId,
      sessionId,
      messageId: reply.id,
      actorId: actor.id,
      event: "error",
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      content: reply.content,
      beforeHash: hashValues(workingParams),
      metadata: {
        error: detail,
        errorName: error instanceof Error ? error.name : "unknown",
        selection,
        surface: context.surface,
      },
    });
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

  const appliedMessage = createTemplateEditMessage(
    "assistant",
    "C’est appliqué au brouillon. Enregistrez pour persister la modification.",
  );
  const state = appendTemplateEditMessage(
    {
      ...session.state,
      workingParams: result.values,
      pendingProposal: null,
      pendingCandidate: null,
    },
    appliedMessage,
  );
  await deps.audit.record({
    organizationId: organizationOf(actor),
    linkId: context.linkId,
    sessionId,
    messageId: appliedMessage.id,
    actorId: actor.id,
    event: "proposal_applied",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    candidateId:
      session.state.pendingCandidate === null ? null : candidateId(session.state.pendingCandidate),
    content: appliedMessage.content,
    operations: proposal.operations,
    beforeHash: hashValues(session.state.workingParams),
    afterHash: hashValues(result.values),
    metadata: { surface: context.surface },
  });
  const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
  if (saved === null) throw new NotFoundError("Session d’édition introuvable");
  return { session: saved, values: result.values };
}

export async function recordTemplateEditLinkSaved(
  deps: TemplateEditSessionDependencies,
  actor: Actor,
  context: TemplateEditSessionContext,
  sessionId: string,
): Promise<void> {
  assertCan(actor, "links:update");
  await deps.audit.record({
    organizationId: organizationOf(actor),
    linkId: context.linkId,
    sessionId,
    actorId: actor.id,
    event: "link_saved",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    afterHash: hashValues(context.workingParams),
    metadata: { surface: context.surface },
  });
}

export { candidateId };
