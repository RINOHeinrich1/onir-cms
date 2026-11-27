"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentAttempt } from "@/application/use-cases/visual-templates/agent-poc/agent-attempt";
import type { AgentInteractionRequest } from "@/application/use-cases/visual-templates/agent-poc/agent-interaction";
import {
  type AgentExecutionOutcome,
  type AgentLoopEvent,
  type AgentPlanOutcome,
  type AgentVerifyOutcome,
  runAgentLoop,
} from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import {
  type AgentObservation,
  type AgentRenderObservation,
  buildAgentObservation,
} from "@/application/use-cases/visual-templates/agent-poc/agent-observation";
import type { TemplateEditPlan } from "@/domain/template-edit-plan";
import type { TemplateParamValues } from "@/domain/template-params";
import styles from "./AgentPocPanel.module.css";
import {
  assistantResultMessage,
  type ChatMessage,
  cancelledMessage,
  cloneValues,
  inconsistentMessage,
  messageId,
  type RevisionSnapshot,
} from "./agent-ui";

type PlanResponse = {
  status: "planned" | "clarification" | "noop" | "rejected";
  plan: TemplateEditPlan | null;
  warnings: string[];
  attempts: number;
  planRaw: unknown;
  skills: Array<{ id: string; version: string; confidence: number; reason: string }>;
  clarification: string | null;
  errors: string[];
};

type ExecuteResponse = {
  ok: boolean;
  values: TemplateParamValues;
  proposal?: { operations: unknown[]; warnings?: string[] } | null;
  logs: AgentExecutionOutcome["logs"];
  errors: string[];
  referenceErrors: string[];
  verification: AgentExecutionOutcome["verification"];
};

type PendingInteraction = {
  assistantId: string;
  request: AgentInteractionRequest;
  values: TemplateParamValues | null;
  observation: AgentObservation | null;
  baseValues: TemplateParamValues;
  baseObservation: AgentObservation;
  lastAttempt: AgentAttempt | null;
};

const PLAN_TIMEOUT_MS = 60_000;
const VERIFY_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (externalSignal?.aborted === true) controller.abort();
  externalSignal?.addEventListener("abort", abort);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new Error("Demande annulée");
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
  options: { status?: NonNullable<ChatMessage["status"]>; trace?: AgentLoopEvent[] } = {},
): ChatMessage {
  return {
    id: messageId(role, Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`)),
    role,
    content,
    at: new Date().toISOString(),
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.trace === undefined ? {} : { trace: options.trace }),
  };
}

function assistantTraceSummary(message: ChatMessage): string {
  const trace = message.trace ?? [];
  if (trace.length === 0) return "Aucune opération";
  const errors = trace.filter((entry) => entry.status === "error").length;
  const status =
    errors > 0
      ? "erreur"
      : message.status === "running"
        ? "en cours"
        : message.status === "cancelled"
          ? "annulé"
          : message.status === "warning"
            ? "à valider"
            : "succès";
  return `${trace.length} opération${trace.length > 1 ? "s" : ""} · ${status}`;
}

export function AgentPocPanel({
  linkId,
  surface,
  initialParams,
  templateId,
  templateVersion,
  label,
}: {
  linkId: string;
  surface: "page" | "widget";
  initialParams: TemplateParamValues;
  templateId: string | null;
  templateVersion: string | null;
  label: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadRef = useRef(0);
  const currentParamsRef = useRef<TemplateParamValues>(initialParams);
  const currentTokenRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const runAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const activeRequestRef = useRef("");
  const activeAssistantRef = useRef<string | null>(null);
  const traceRef = useRef<AgentLoopEvent[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [pendingInteraction, setPendingInteraction] = useState<PendingInteraction | null>(null);
  const [interactionText, setInteractionText] = useState("");
  const [coherenceLost, setCoherenceLost] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      "assistant",
      "Bonjour. Décrivez la modification que vous souhaitez apporter à votre interface. Je prépare le changement, je le vérifie, puis vous validez le résultat.",
    ),
  ]);
  const [revisions, setRevisions] = useState<RevisionSnapshot[]>([
    {
      id: "initial",
      label: "État initial",
      createdAt: new Date().toISOString(),
      values: cloneValues(initialParams),
      stateHash: "initial",
    },
  ]);
  const [currentRevisionId, setCurrentRevisionId] = useState("initial");

  const updateMessage = (
    id: string,
    patch: Partial<Pick<ChatMessage, "content" | "status" | "trace">>,
  ): void => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...patch } : message)),
    );
  };

  const addRevision = (label: string, values: TemplateParamValues, stateHash: string): string => {
    const id = `revision-${Date.now()}`;
    setRevisions((current) => [
      ...current.slice(-19),
      {
        id,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        createdAt: new Date().toISOString(),
        values: cloneValues(values),
        stateHash,
      },
    ]);
    setCurrentRevisionId(id);
    return id;
  };

  const createPreview = async (
    nextParams: TemplateParamValues,
    token: string | null,
    signal?: AbortSignal,
  ): Promise<{ token: string; revision: number }> => {
    const template =
      templateId === null || templateVersion === null
        ? undefined
        : `${templateId}@${templateVersion}`;
    const response = await fetchWithTimeout(
      `/api/links/${linkId}/preview-session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface,
          params: nextParams,
          ...(template === undefined ? {} : { template }),
          ...(token === null ? {} : { token }),
        }),
      },
      PLAN_TIMEOUT_MS,
      signal,
    );
    if (!response.ok) throw new Error("Impossible de préparer l’aperçu");
    const json = (await response.json()) as { token: string };
    const nextRevision = revisionRef.current + 1;
    revisionRef.current = nextRevision;
    setPreviewToken(json.token);
    setRevision(nextRevision);
    return { token: json.token, revision: nextRevision };
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: l’aperçu initial est créé une seule fois
  useEffect(() => {
    let cancelled = false;
    void createPreview(initialParams, null)
      .then(({ token }) => {
        currentTokenRef.current = token;
        currentParamsRef.current = initialParams;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCoherenceLost(true);
          console.error("Préparation de l’aperçu impossible", error);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (messages.length === 0 && pendingInteraction === null && !running) return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pendingInteraction, running]);

  const waitForIframeLoad = async (previousCount: number, signal?: AbortSignal): Promise<void> => {
    for (let index = 0; index < 160; index += 1) {
      throwIfAborted(signal);
      if (iframeLoadRef.current > previousCount) return;
      await delay(100);
    }
    throw new Error("Le nouvel aperçu ne s’est pas chargé");
  };

  const waitForPreview = async (
    expectedToken?: string,
    expectedRevision?: number,
    signal?: AbortSignal,
  ): Promise<Document> => {
    for (let index = 0; index < 100; index += 1) {
      throwIfAborted(signal);
      const iframe = iframeRef.current;
      const href = iframe?.contentWindow?.location.href ?? "";
      const doc = iframe?.contentDocument;
      const ready = doc?.querySelector('[data-onirtech-ready="1"]');
      const host = doc?.querySelector("onirtech-template-puzzle");
      const tokenMatches =
        expectedToken === undefined ||
        href.includes(`preview=${encodeURIComponent(expectedToken)}`);
      const revisionMatches =
        expectedRevision === undefined || href.includes(`v=${expectedRevision}`);
      if (
        doc !== null &&
        doc !== undefined &&
        ready !== null &&
        ready !== undefined &&
        host !== null &&
        host !== undefined &&
        tokenMatches &&
        revisionMatches
      ) {
        await delay(150);
        throwIfAborted(signal);
        return doc;
      }
      await delay(100);
    }
    throw new Error("L’aperçu n’est pas prêt");
  };

  const readRender = async (
    expectedToken?: string,
    expectedRevision?: number,
    signal?: AbortSignal,
  ): Promise<AgentRenderObservation> => {
    const doc = await waitForPreview(expectedToken, expectedRevision, signal);
    throwIfAborted(signal);
    const root = doc.querySelector("onirtech-template-puzzle")?.shadowRoot;
    if (root === null || root === undefined) throw new Error("Shadow DOM indisponible");
    const header = root.querySelector("header")?.innerText ?? "";
    const main = root.querySelector("main")?.innerText ?? "";
    return {
      revision: expectedRevision ?? revisionRef.current,
      text: `${header}\n${main}`.slice(0, 12_000),
      header,
      main,
    };
  };

  const applyPreview = async (
    values: TemplateParamValues,
    signal?: AbortSignal,
  ): Promise<{ token: string; render: AgentRenderObservation }> => {
    const previousLoad = iframeLoadRef.current;
    const token = currentTokenRef.current;
    const next = await createPreview(values, token, signal);
    await waitForIframeLoad(previousLoad, signal);
    const render = await readRender(next.token, next.revision, signal);
    currentTokenRef.current = next.token;
    return { token: next.token, render };
  };

  const observeValues = async (values: TemplateParamValues): Promise<AgentObservation> => {
    const render = await readRender(undefined, undefined, runAbortRef.current?.signal);
    return buildAgentObservation({ values, render });
  };

  const plan = async (input: {
    request: string;
    values: TemplateParamValues;
    observation: AgentObservation;
    lastAttempt: AgentAttempt | null;
    previousPlan: unknown;
    previousErrors: string[];
  }): Promise<AgentPlanOutcome> => {
    throwIfAborted(runAbortRef.current?.signal);
    const response = await fetchWithTimeout(
      `/api/links/${linkId}/agent-poc/plan`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: input.request,
          params: input.values,
          surface,
          observation: input.observation,
          ...(input.lastAttempt === null ? {} : { lastAttempt: input.lastAttempt }),
          ...(input.previousPlan === null ? {} : { previousPlan: input.previousPlan }),
          previousErrors: input.previousErrors,
        }),
      },
      PLAN_TIMEOUT_MS,
      runAbortRef.current?.signal,
    );
    if (!response.ok) throw new Error("Le planner a échoué");
    const data = (await response.json()) as PlanResponse;
    if (data.status === "planned") {
      return {
        status: "planned",
        rawPlan: data.planRaw,
        warnings: data.warnings,
        attempts: data.attempts,
      };
    }
    if (data.status === "clarification" || data.status === "noop") {
      return {
        status: data.status,
        message: data.clarification ?? data.warnings.join(" ; ") ?? "",
        rawPlan: data.planRaw,
        warnings: data.warnings,
        attempts: data.attempts,
      };
    }
    return {
      status: "rejected",
      errors: data.errors,
      warnings: data.warnings,
      rawPlan: data.planRaw,
      attempts: data.attempts,
    };
  };

  const execute = async (input: {
    values: TemplateParamValues;
    rawPlan: unknown;
  }): Promise<AgentExecutionOutcome> => {
    throwIfAborted(runAbortRef.current?.signal);
    const response = await fetchWithTimeout(
      `/api/links/${linkId}/agent-poc/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: input.rawPlan,
          params: input.values,
          surface,
          request: activeRequestRef.current,
        }),
      },
      PLAN_TIMEOUT_MS,
      runAbortRef.current?.signal,
    );
    if (!response.ok) throw new Error("L’exécution du plan a échoué");
    return (await response.json()) as ExecuteResponse;
  };

  const verify = async (input: {
    goal: string;
    observation: AgentObservation;
    execution: AgentExecutionOutcome;
  }): Promise<AgentVerifyOutcome> => {
    throwIfAborted(runAbortRef.current?.signal);
    const response = await fetchWithTimeout(
      `/api/links/${linkId}/agent-poc/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: input.goal,
          observation: input.observation,
          execution: input.execution,
        }),
      },
      VERIFY_TIMEOUT_MS,
      runAbortRef.current?.signal,
    );
    if (!response.ok) throw new Error("La vérification a échoué");
    return (await response.json()) as AgentVerifyOutcome;
  };

  const emit = (event: AgentLoopEvent): void => {
    traceRef.current.push(event);
    const assistantId = activeAssistantRef.current;
    if (assistantId === null) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              status:
                event.status === "error"
                  ? "error"
                  : event.status === "warning"
                    ? "warning"
                    : (message.status ?? "running"),
              trace: [...(message.trace ?? []), event],
            }
          : message,
      ),
    );
  };

  const explainFailure = async (
    request: string,
    result: { reason: string; lastAttempt: AgentAttempt | null; observation: AgentObservation },
    trace: AgentLoopEvent[],
    signal?: AbortSignal,
  ): Promise<string | null> => {
    try {
      const response = await fetchWithTimeout(
        `/api/links/${linkId}/agent-poc/explain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request,
            reason: result.reason,
            trace,
            attempt: result.lastAttempt,
            observation: result.observation,
          }),
        },
        PLAN_TIMEOUT_MS,
        signal,
      );
      if (!response.ok) return null;
      const json = (await response.json()) as { message?: unknown };
      return typeof json.message === "string" && json.message.trim() !== ""
        ? json.message.trim()
        : null;
    } catch {
      return null;
    }
  };

  const restoreAccepted = async (): Promise<boolean> => {
    try {
      const restored = await applyPreview(currentParamsRef.current);
      buildAgentObservation({ values: currentParamsRef.current, render: restored.render });
      return true;
    } catch (error) {
      setCoherenceLost(true);
      console.error("Restauration de l’aperçu impossible", error);
      return false;
    }
  };

  const runAgent = async (userInstruction = ""): Promise<void> => {
    const request = userInstruction.trim() === "" ? goal.trim() : userInstruction.trim();
    if (running || coherenceLost || request === "") return;
    const effectiveGoal =
      userInstruction.trim() === ""
        ? request
        : `${goal.trim()}\n\nPrécision utilisateur : ${request}`;
    const values = currentParamsRef.current;
    const controller = new AbortController();
    runAbortRef.current = controller;
    cancelRequestedRef.current = false;
    activeRequestRef.current = effectiveGoal;
    traceRef.current = [];
    const assistant = createMessage("assistant", "", { status: "running", trace: [] });
    activeAssistantRef.current = assistant.id;
    setRunning(true);
    setPendingInteraction(null);
    setInteractionText("");
    setMessages((current) => [...current, createMessage("user", request), assistant]);

    try {
      const result = await runAgentLoop({
        goal: effectiveGoal,
        values,
        ports: {
          initialObservation: async () => observeValues(values),
          plan,
          execute,
          observeCandidate: async (candidateValues) => {
            const applied = await applyPreview(candidateValues, controller.signal);
            return buildAgentObservation({ values: candidateValues, render: applied.render });
          },
          restore: async (restoredValues) => {
            const restored = await applyPreview(restoredValues);
            return buildAgentObservation({ values: restoredValues, render: restored.render });
          },
          verify,
          emit,
        },
      });

      if (cancelRequestedRef.current) {
        const restored = await restoreAccepted();
        updateMessage(assistant.id, {
          content: cancelledMessage(),
          status: "cancelled",
        });
        if (!restored) setCoherenceLost(true);
        return;
      }

      if (result.status === "success") {
        currentParamsRef.current = result.values;
        setCoherenceLost(false);
        addRevision(request, result.values, result.observation.stateHash);
        updateMessage(assistant.id, {
          content: assistantResultMessage(result, request),
          status: "success",
        });
      } else if (result.status === "inconsistent") {
        setCoherenceLost(true);
        updateMessage(assistant.id, {
          content: inconsistentMessage(result.reason),
          status: "error",
        });
      } else if (result.status === "awaiting_user_input") {
        setPendingInteraction({
          assistantId: assistant.id,
          request: result.interaction,
          values: result.values,
          observation: result.observation,
          baseValues: result.baseValues,
          baseObservation: result.baseObservation,
          lastAttempt: result.lastAttempt,
        });
        updateMessage(assistant.id, {
          content: assistantResultMessage(result, request),
          status: "warning",
        });
      } else if (result.status === "clarification") {
        setPendingInteraction({
          assistantId: assistant.id,
          request: result.interaction,
          values: null,
          observation: null,
          baseValues: currentParamsRef.current,
          baseObservation: result.observation,
          lastAttempt: result.lastAttempt,
        });
        updateMessage(assistant.id, {
          content: assistantResultMessage(result, request),
          status: "warning",
        });
      } else if (result.status === "blocked" || result.status === "failed") {
        updateMessage(assistant.id, {
          content: "Je vérifie ce qui a bloqué et je prépare une piste de correction…",
          status: "error",
        });
        const explanation = await explainFailure(
          request,
          result,
          traceRef.current,
          controller.signal,
        );
        if (cancelRequestedRef.current) {
          const restored = await restoreAccepted();
          updateMessage(assistant.id, { content: cancelledMessage(), status: "cancelled" });
          if (!restored) setCoherenceLost(true);
          return;
        }
        updateMessage(assistant.id, {
          content: explanation ?? assistantResultMessage(result, request),
          status: result.status === "blocked" ? "warning" : "error",
        });
      } else {
        updateMessage(assistant.id, {
          content: assistantResultMessage(result, request),
          status: "warning",
        });
      }
    } catch {
      const aborted = cancelRequestedRef.current || controller.signal.aborted;
      if (aborted) {
        const restored = await restoreAccepted();
        updateMessage(assistant.id, { content: cancelledMessage(), status: "cancelled" });
        if (!restored) setCoherenceLost(true);
      } else {
        const restored = await restoreAccepted();
        updateMessage(assistant.id, {
          content: restored
            ? "Je n’ai pas pu terminer cette demande. L’état précédent de l’aperçu a été restauré."
            : "Je n’ai pas pu terminer cette demande et je ne peux pas garantir la cohérence de l’aperçu. Recharge la page.",
          status: restored ? "error" : "error",
        });
        if (!restored) setCoherenceLost(true);
      }
    } finally {
      activeAssistantRef.current = null;
      runAbortRef.current = null;
      setRunning(false);
    }
  };

  const cancelRun = (): void => {
    if (!running) return;
    cancelRequestedRef.current = true;
    if (activeAssistantRef.current !== null) {
      updateMessage(activeAssistantRef.current, {
        content: "Annulation en cours…",
        status: "warning",
      });
    }
    runAbortRef.current?.abort();
  };

  const keepInteraction = (): void => {
    if (
      pendingInteraction === null ||
      pendingInteraction.values === null ||
      pendingInteraction.observation === null
    ) {
      return;
    }
    currentParamsRef.current = pendingInteraction.values;
    addRevision(
      goal.trim() || "Résultat accepté",
      pendingInteraction.values,
      pendingInteraction.observation.stateHash,
    );
    updateMessage(pendingInteraction.assistantId, {
      content:
        "J’ai conservé ce résultat dans l’aperçu. Tu peux continuer à partir de cet état ou demander une nouvelle modification.",
      status: "success",
    });
    setPendingInteraction(null);
  };

  const restoreInteraction = async (
    label: string,
    status: NonNullable<ChatMessage["status"]>,
  ): Promise<boolean> => {
    if (pendingInteraction === null) return false;
    try {
      const restored = await applyPreview(pendingInteraction.baseValues);
      buildAgentObservation({ values: pendingInteraction.baseValues, render: restored.render });
      currentParamsRef.current = pendingInteraction.baseValues;
      updateMessage(pendingInteraction.assistantId, { content: label, status });
      setPendingInteraction(null);
      setInteractionText("");
      return true;
    } catch (error) {
      setCoherenceLost(true);
      console.error("Restauration de l’interaction impossible", error);
      updateMessage(pendingInteraction.assistantId, {
        content: "Je n’ai pas pu restaurer l’aperçu. Recharge la page avant de continuer.",
        status: "error",
      });
      return false;
    }
  };

  const defaultInteractionOption = (): string => {
    if (pendingInteraction === null) return "";
    return (
      pendingInteraction.request.options.find(
        (option) => option.id !== "keep" && option.id !== "cancel",
      )?.id ?? "clarify"
    );
  };

  const submitInteraction = async (optionId?: string): Promise<void> => {
    if (pendingInteraction === null) return;
    const selectedId =
      optionId ??
      pendingInteraction.request.options.find(
        (option) => option.id !== "keep" && option.id !== "cancel",
      )?.id;
    if (selectedId === undefined) return;
    if (selectedId === "keep") {
      keepInteraction();
      return;
    }
    if (selectedId === "cancel") {
      await restoreInteraction("J’ai annulé la modification.", "cancelled");
      return;
    }
    const selected = pendingInteraction.request.options.find((option) => option.id === selectedId);
    const text = interactionText.trim();
    if (text === "") {
      updateMessage(pendingInteraction.assistantId, {
        content: "Précise ce que tu souhaites corriger pour que je puisse continuer.",
        status: "warning",
      });
      return;
    }
    const instruction = selected === undefined ? text : `${selected.label} : ${text}`;
    const restored = await restoreInteraction("Je prépare une nouvelle tentative.", "warning");
    if (restored) await runAgent(instruction);
  };

  const restoreRevision = async (revisionSnapshot: RevisionSnapshot): Promise<void> => {
    if (running || coherenceLost || pendingInteraction !== null) return;
    const confirmed = window.confirm(
      `Revenir à « ${revisionSnapshot.label} » ? Les modifications non conservées de l’aperçu seront remplacées.`,
    );
    if (!confirmed) return;
    try {
      const restored = await applyPreview(revisionSnapshot.values);
      buildAgentObservation({ values: revisionSnapshot.values, render: restored.render });
      currentParamsRef.current = revisionSnapshot.values;
      setCurrentRevisionId(revisionSnapshot.id);
      setHistoryOpen(false);
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          `J’ai restauré l’état « ${revisionSnapshot.label} ». Les modifications suivantes ont été annulées.`,
          { status: "success" },
        ),
      ]);
    } catch (error) {
      setCoherenceLost(true);
      console.error("Restauration de la révision impossible", error);
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          "Je n’ai pas pu restaurer cet état. Recharge la page avant de continuer.",
          { status: "error" },
        ),
      ]);
    }
  };

  const previewSrc =
    previewToken === null
      ? ""
      : `/liens/${linkId}/apercu?embed=1&surface=${surface}&preview=${encodeURIComponent(previewToken)}&v=${revision}`;

  return (
    <main className={styles.shell}>
      <aside className={styles.panel}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>ASSISTANT D’ÉDITION</span>
            <strong>{label}</strong>
            <span className={styles.hint}>
              Brouillon d’aperçu · rien n’est publié automatiquement
            </span>
          </div>
          <button
            type="button"
            className={styles.historyButton}
            onClick={() => setHistoryOpen(true)}
          >
            Historique
          </button>
        </header>

        {coherenceLost ? (
          <p className={styles.warning}>
            La cohérence de l’aperçu n’est plus garantie. Recharge la page.
          </p>
        ) : null}

        <div className={styles.chat} aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={styles.message} data-role={message.role}>
              <span className={styles.messageRole}>
                {message.role === "user" ? "Vous" : "Assistant"}
              </span>
              {message.trace !== undefined && message.trace.length > 0 ? (
                <details className={styles.trace}>
                  <summary>Détails de l’exécution · {assistantTraceSummary(message)}</summary>
                  <div className={styles.traceList}>
                    {message.trace.map((event) => (
                      <div
                        key={`${message.id}-${event.phase}-${event.title}-${event.attempt ?? ""}-${event.stepId ?? ""}-${event.detail ?? ""}`}
                        className={styles.traceEntry}
                        data-status={event.status}
                      >
                        <span>{event.phase}</span>
                        <strong>{event.title}</strong>
                        {event.detail === undefined ? null : <p>{event.detail}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {message.content === "" ? (
                <p className={styles.thinking}>
                  {message.status === "running" ? "Je travaille sur votre demande…" : "…"}
                </p>
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))}
          <div ref={chatEndRef} />
        </div>

        {pendingInteraction === null ? null : (
          <section className={styles.interaction}>
            <p className={styles.interactionQuestion}>{pendingInteraction.request.question}</p>
            <div className={styles.interactionOptions}>
              {pendingInteraction.request.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === "keep" ? styles.keep : styles.cancel}
                  onClick={() => void submitInteraction(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <textarea
              className={styles.input}
              rows={2}
              value={interactionText}
              onChange={(event) => setInteractionText(event.target.value)}
              placeholder="Précisez votre réponse ou la correction à appliquer…"
            />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void submitInteraction(defaultInteractionOption())}
            >
              Envoyer la précision
            </button>
          </section>
        )}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void runAgent();
          }}
        >
          <textarea
            className={styles.input}
            rows={2}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Décrivez la modification souhaitée…"
            disabled={running || coherenceLost}
          />
          <div className={styles.composerActions}>
            {running ? (
              <button type="button" className={styles.cancelAction} onClick={cancelRun}>
                Annuler
              </button>
            ) : null}
            <button
              type="submit"
              className={styles.primary}
              disabled={running || coherenceLost || goal.trim() === "" || previewToken === null}
            >
              Envoyer
            </button>
          </div>
        </form>
      </aside>

      {historyOpen ? (
        <div className={styles.drawerBackdrop}>
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <strong>Historique de l’aperçu</strong>
              <button type="button" className={styles.close} onClick={() => setHistoryOpen(false)}>
                Fermer
              </button>
            </div>
            <div className={styles.revisionList}>
              {[...revisions].reverse().map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={styles.revision}
                  data-current={entry.id === currentRevisionId}
                  disabled={running || coherenceLost || pendingInteraction !== null}
                  onClick={() => void restoreRevision(entry)}
                >
                  <strong>{entry.label}</strong>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  {entry.id === currentRevisionId ? (
                    <em>État courant</em>
                  ) : (
                    <em>Revenir à cet état</em>
                  )}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <section className={styles.preview}>
        {previewSrc === "" ? (
          <p>Préparation de l’aperçu…</p>
        ) : (
          <iframe
            key={previewSrc}
            ref={iframeRef}
            src={previewSrc}
            title="Aperçu agent"
            onLoad={() => {
              iframeLoadRef.current += 1;
            }}
          />
        )}
      </section>
    </main>
  );
}
