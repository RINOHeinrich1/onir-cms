import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, TemplateEditGenerationError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { TemplateEditAuditRepository } from "@/application/ports/template-edit-audit-repository";
import type { TemplateEditSessionRepository } from "@/application/ports/template-edit-session-repository";
import type { TemplateSkillLoader } from "@/application/ports/template-skill-loader";
import { applyTemplateEditProposal } from "@/domain/template-edit-proposal";
import { validateTemplateEditReferences } from "@/domain/template-edit-references";
import {
  collectTemplateEditCandidates,
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
import { planTemplateEdit } from "./plan-template-edit";
import { routeTemplateSkills } from "./route-template-skills";
import { emitTemplateEditEvent, type TemplateEditEventSink } from "./template-edit-events";

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
  skillLoader: TemplateSkillLoader;
};

import { hashTemplateEditValues as hashValues } from "./template-edit-values-hash";

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
  events?: TemplateEditEventSink,
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

  const turnId = crypto.randomUUID();
  emitTemplateEditEvent(events, {
    stage: "session",
    status: "success",
    title: "Session chargée",
    summary: `${message.length} caractère(s) reçu(s)`,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
  });
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
    turnId,
    actorId: actor.id,
    event: "user_message",
    stage: "user_input",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    content: message,
    beforeHash: hashValues(workingParams),
    metadata: { selection, surface: context.surface },
  });

  const history = state.messages
    .slice(0, -1)
    .map((entry) => ({ role: entry.role, content: entry.content }));
  const pageResolution = resolveTemplateEditTarget({
    request: message,
    currentPageId: null,
    selection: selection === null ? null : { regionId: selection },
    editor: context.editor,
    values: workingParams,
  });
  const candidates = collectTemplateEditCandidates(
    {
      request: message,
      currentPageId: null,
      selection: selection === null ? null : { regionId: selection },
      editor: context.editor,
      values: workingParams,
    },
    40,
  );

  emitTemplateEditEvent(events, {
    stage: "targets",
    status: "success",
    title: "Cibles candidates",
    summary: `${candidates.length} candidate(s)`,
    detail: candidates.slice(0, 12).map((candidate) => ({
      id: candidateId(candidate),
      label: candidate.label,
      score: candidate.score,
    })),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
  });

  await deps.audit.record({
    organizationId: organizationOf(actor),
    linkId: context.linkId,
    sessionId,
    messageId: userMessage.id,
    turnId,
    actorId: actor.id,
    event: "target_candidates",
    stage: "target_resolution",
    templateId: context.templateId,
    templateVersion: context.templateVersion,
    content: message,
    beforeHash: hashValues(workingParams),
    metadata: {
      surface: context.surface,
      selection,
      page: pageResolution.page,
      candidates: candidates.map((candidate) => ({
        id: candidateId(candidate),
        label: candidate.label,
        kind: candidate.itemKind ?? null,
        scope: candidate.scope,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
    },
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
      turnId,
      actorId: actor.id,
      event: "not_found",
      stage: "target_resolution",
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

  let stage = "skill_loading";
  try {
    emitTemplateEditEvent(events, {
      stage: "skills_load",
      status: "running",
      title: "Chargement des skills",
      startedAt: new Date().toISOString(),
    });
    const loadedSkills = await deps.skillLoader.load(context.templateId, context.templateVersion);
    emitTemplateEditEvent(events, {
      stage: "skills_load",
      status: "success",
      title: "Skills chargés",
      summary: `${loadedSkills.length} skill(s) installé(s)`,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
    });
    stage = "skill_routing";
    const routed = await routeTemplateSkills({ aiFactory: deps.aiFactory }, actor, {
      request: message,
      skills: loadedSkills,
      history,
    });
    const skillIds = routed.skills.map((entry) => ({
      id: entry.skill.skill.id,
      version: entry.skill.skill.version,
      confidence: entry.confidence,
      reason: entry.reason,
    }));
    emitTemplateEditEvent(events, {
      stage: "skills",
      status: "success",
      title: "Routage des skills",
      summary:
        routed.skills.length === 0
          ? "Aucun skill sélectionné"
          : routed.skills.map((entry) => entry.skill.skill.id).join(", "),
      detail: skillIds,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 0,
    });

    await deps.audit.record({
      organizationId: organizationOf(actor),
      linkId: context.linkId,
      sessionId,
      messageId: userMessage.id,
      turnId,
      actorId: actor.id,
      event: "skill_routing",
      stage,
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      content: message,
      beforeHash: hashValues(workingParams),
      metadata: {
        surface: context.surface,
        selection,
        candidates: routed.candidates,
        selected: skillIds,
        clarification: routed.clarification,
      },
    });
    if (routed.clarification !== null && routed.skills.length === 0) {
      const clarification = createTemplateEditMessage("assistant", routed.clarification);
      state = appendTemplateEditMessage(
        { ...state, pendingProposal: null, pendingCandidate: null },
        clarification,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: clarification.id,
        turnId,
        actorId: actor.id,
        event: "clarification_required",
        stage: "skill_routing",
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: clarification.content,
        beforeHash: hashValues(workingParams),
        metadata: { selection, surface: context.surface },
      });
      const saved = await deps.sessions.save(
        organizationOf(actor),
        context.linkId,
        sessionId,
        state,
      );
      if (saved === null) throw new NotFoundError("Session d’édition introuvable");
      return saved;
    }
    const selectedSkills = routed.skills.map((entry) => entry.skill.skill);
    stage = "planning";
    const planned = await planTemplateEdit({ aiFactory: deps.aiFactory }, actor, {
      request: message,
      page: pageResolution.page,
      candidates,
      editor: context.editor,
      schema: context.schema,
      values: workingParams,
      skills: selectedSkills,
      history,
    });

    if (planned.status === "noop") {
      const reply = createTemplateEditMessage("assistant", planned.message);
      state = appendTemplateEditMessage(
        {
          ...state,
          pendingProposal: null,
          pendingValues: null,
          pendingCandidate: null,
          pendingBaseHash: null,
        },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        turnId,
        actorId: actor.id,
        event: "noop",
        stage,
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        beforeHash: hashValues(workingParams),
        warnings: planned.warnings,
        rawResponse: planned.rawPlan,
        metadata: { selection, surface: context.surface, attempts: planned.attempts },
      });
    } else if (planned.status === "clarification") {
      const reply = createTemplateEditMessage("assistant", planned.message);
      state = appendTemplateEditMessage(
        { ...state, pendingProposal: null, pendingCandidate: null },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        turnId,
        actorId: actor.id,
        event: "clarification_required",
        stage,
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        beforeHash: hashValues(workingParams),
        warnings: planned.warnings,
        rawResponse: planned.rawPlan,
        metadata: { selection, surface: context.surface, attempts: planned.attempts },
      });
    } else if (planned.status === "rejected") {
      const reply = createTemplateEditMessage(
        "assistant",
        `Je n’ai pas pu produire de plan valide. ${planned.errors.join(" ; ")}`,
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
        turnId,
        actorId: actor.id,
        event: "proposal_rejected",
        stage,
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        beforeHash: hashValues(workingParams),
        warnings: planned.warnings,
        rawResponse: planned.rawPlan,
        validationErrors: planned.errors,
        metadata: { selection, surface: context.surface, attempts: planned.attempts },
      });
    } else {
      const reply = createTemplateEditMessage(
        "assistant",
        `J’ai préparé un plan de ${planned.proposal.operations.length} étape${planned.proposal.operations.length > 1 ? "s" : ""}. Vérifiez les détails avant d’appliquer.`,
        { proposal: planned.proposal },
      );
      state = appendTemplateEditMessage(
        { ...state, pendingProposal: planned.proposal, pendingCandidate: null },
        reply,
      );
      await deps.audit.record({
        organizationId: organizationOf(actor),
        linkId: context.linkId,
        sessionId,
        messageId: reply.id,
        turnId,
        actorId: actor.id,
        event: "proposal_created",
        stage,
        templateId: context.templateId,
        templateVersion: context.templateVersion,
        content: reply.content,
        operations: planned.proposal.operations,
        warnings: planned.warnings,
        beforeHash: hashValues(workingParams),
        metadata: {
          surface: context.surface,
          selection,
          attempts: planned.attempts,
          skills: skillIds,
          rawPlan: planned.rawPlan,
        },
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
    const isGenerationError = error instanceof TemplateEditGenerationError;
    await deps.audit.record({
      organizationId: organizationOf(actor),
      linkId: context.linkId,
      sessionId,
      messageId: reply.id,
      turnId,
      actorId: actor.id,
      event: isGenerationError ? "proposal_rejected" : "error",
      stage,
      templateId: context.templateId,
      templateVersion: context.templateVersion,
      content: reply.content,
      beforeHash: hashValues(workingParams),
      ...(isGenerationError
        ? {
            rawResponse: error.rawResponse,
            validationErrors: error.validationErrors,
          }
        : {}),
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
  if (
    session.state.pendingBaseHash !== undefined &&
    session.state.pendingBaseHash !== null &&
    hashValues(context.workingParams) !== session.state.pendingBaseHash
  ) {
    throw new ValidationError("PLAN_STALE : le brouillon a changé depuis la proposition");
  }

  let values = session.state.pendingValues ?? null;
  if (values !== null) {
    const referenceErrors = validateTemplateEditReferences(context.editor, values);
    if (referenceErrors.length > 0) {
      throw new ValidationError(
        referenceErrors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
      );
    }
  } else {
    const result = applyTemplateEditProposal({
      editor: context.editor,
      schema: context.schema,
      values: context.workingParams,
      proposal,
    });
    if (!result.ok) {
      throw new ValidationError(
        result.errors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
      );
    }
    values = result.values;
  }

  const appliedMessage = createTemplateEditMessage(
    "assistant",
    "C’est appliqué au brouillon. Enregistrez pour persister la modification.",
  );
  const state = appendTemplateEditMessage(
    {
      ...session.state,
      workingParams: values,
      pendingProposal: null,
      pendingValues: null,
      pendingCandidate: null,
      pendingBaseHash: null,
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
    afterHash: hashValues(values),
    metadata: {
      surface: context.surface,
      source: session.state.pendingValues === null ? "proposal" : "planned_values",
    },
  });
  const saved = await deps.sessions.save(organizationOf(actor), context.linkId, sessionId, state);
  if (saved === null) throw new NotFoundError("Session d’édition introuvable");
  return { session: saved, values };
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
