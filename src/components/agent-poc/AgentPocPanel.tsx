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

type LogEntry = {
  title: string;
  detail: string;
  status: "running" | "success" | "warning" | "error";
};

type PendingInteraction = {
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

function logStatus(status: AgentLoopEvent["status"]): LogEntry["status"] {
  return status;
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  const sequence = Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
  return {
    id: messageId(role, sequence),
    role,
    content,
    at: new Date().toISOString(),
  };
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [observation, setObservation] = useState<AgentObservation | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<PendingInteraction | null>(null);
  const [interactionText, setInteractionText] = useState("");
  const [coherenceLost, setCoherenceLost] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
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

  const addMessage = (role: ChatMessage["role"], content: string): void => {
    setMessages((current) => [...current, createMessage(role, content)]);
  };

  const log = (entry: LogEntry): void => {
    setLogs((current) => [...current, entry]);
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
          log({
            title: "Aperçu",
            detail: error instanceof Error ? error.message : "Erreur",
            status: "error",
          });
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
    log({ title: event.title, detail: event.detail ?? "", status: logStatus(event.status) });
  };

  const restoreAccepted = async (): Promise<boolean> => {
    try {
      const restored = await applyPreview(currentParamsRef.current);
      const baseObservation = buildAgentObservation({
        values: currentParamsRef.current,
        render: restored.render,
      });
      setObservation(baseObservation);
      return true;
    } catch (error) {
      setCoherenceLost(true);
      log({
        title: "Restauration",
        detail: error instanceof Error ? error.message : "Restauration impossible",
        status: "error",
      });
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
    setRunning(true);
    setCancelling(false);
    setFinalStatus(null);
    setLogs([]);
    setPendingInteraction(null);
    setInteractionText("");
    addMessage("user", request);

    try {
      const result = await runAgentLoop({
        goal: effectiveGoal,
        values,
        ports: {
          initialObservation: async () => {
            const initial = await observeValues(values);
            setObservation(initial);
            return initial;
          },
          plan,
          execute,
          observeCandidate: async (candidateValues) => {
            const applied = await applyPreview(candidateValues, controller.signal);
            const candidate = buildAgentObservation({
              values: candidateValues,
              render: applied.render,
            });
            setObservation(candidate);
            return candidate;
          },
          restore: async (restoredValues) => {
            const restored = await applyPreview(restoredValues);
            const restoredObservation = buildAgentObservation({
              values: restoredValues,
              render: restored.render,
            });
            setObservation(restoredObservation);
            return restoredObservation;
          },
          verify,
          emit,
        },
      });

      if (cancelRequestedRef.current) {
        const restored = await restoreAccepted();
        addMessage("assistant", cancelledMessage());
        setFinalStatus(restored ? "Demande annulée" : "Annulation partielle — recharge la page");
        return;
      }

      if (result.status === "success") {
        currentParamsRef.current = result.values;
        setCoherenceLost(false);
        addRevision(request, result.values, result.observation.stateHash);
        addMessage("assistant", assistantResultMessage(result, request));
        setFinalStatus("Résultat prêt dans l’aperçu");
      } else if (result.status === "inconsistent") {
        setCoherenceLost(true);
        addMessage("assistant", inconsistentMessage(result.reason));
        setFinalStatus("Cohérence non garantie — recharge la page");
      } else if (result.status === "awaiting_user_input") {
        setPendingInteraction({
          request: result.interaction,
          values: result.values,
          observation: result.observation,
          baseValues: result.baseValues,
          baseObservation: result.baseObservation,
          lastAttempt: result.lastAttempt,
        });
        setObservation(result.observation);
        addMessage("assistant", assistantResultMessage(result, request));
        setFinalStatus("J’attends ta réponse");
      } else if (result.status === "clarification") {
        setPendingInteraction({
          request: result.interaction,
          values: null,
          observation: null,
          baseValues: currentParamsRef.current,
          baseObservation: result.observation,
          lastAttempt: result.lastAttempt,
        });
        addMessage("assistant", assistantResultMessage(result, request));
        setFinalStatus("J’attends une précision");
      } else {
        addMessage("assistant", assistantResultMessage(result, request));
        setFinalStatus(
          result.status === "blocked" ? "Demande interrompue" : "Objectif non atteint",
        );
      }
    } catch (error) {
      const aborted = cancelRequestedRef.current || controller.signal.aborted;
      if (aborted) {
        const restored = await restoreAccepted();
        addMessage("assistant", cancelledMessage());
        setFinalStatus(restored ? "Demande annulée" : "Annulation partielle — recharge la page");
      } else {
        log({
          title: "Erreur",
          detail: error instanceof Error ? error.message : "Erreur inconnue",
          status: "error",
        });
        const restored = await restoreAccepted();
        addMessage(
          "assistant",
          restored
            ? "Je n’ai pas pu terminer cette demande. L’état précédent de l’aperçu a été restauré."
            : "Je n’ai pas pu terminer cette demande et je ne peux pas garantir la cohérence de l’aperçu. Recharge la page.",
        );
        setFinalStatus(restored ? "Demande interrompue" : "Cohérence non garantie");
        if (!restored) setCoherenceLost(true);
      }
    } finally {
      runAbortRef.current = null;
      setRunning(false);
      setCancelling(false);
    }
  };

  const cancelRun = (): void => {
    if (!running) return;
    cancelRequestedRef.current = true;
    setCancelling(true);
    setFinalStatus("Annulation en cours…");
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
    setObservation(pendingInteraction.observation);
    addRevision(
      goal.trim() || "Résultat accepté",
      pendingInteraction.values,
      pendingInteraction.observation.stateHash,
    );
    setPendingInteraction(null);
    addMessage(
      "assistant",
      "J’ai conservé ce résultat dans l’aperçu. Tu peux continuer à partir de cet état ou demander une nouvelle modification.",
    );
    setFinalStatus("Résultat conservé dans l’aperçu");
  };

  const restoreInteraction = async (label: string): Promise<boolean> => {
    if (pendingInteraction === null) return false;
    try {
      const restored = await applyPreview(pendingInteraction.baseValues);
      const baseObservation = buildAgentObservation({
        values: pendingInteraction.baseValues,
        render: restored.render,
      });
      currentParamsRef.current = pendingInteraction.baseValues;
      setObservation(baseObservation);
      setPendingInteraction(null);
      setInteractionText("");
      setFinalStatus(label);
      addMessage("assistant", `${label}. L’aperçu a été restauré à l’état précédent.`);
      return true;
    } catch (error) {
      log({
        title: "Restauration",
        detail: error instanceof Error ? error.message : "Restauration impossible",
        status: "error",
      });
      addMessage(
        "assistant",
        "Je n’ai pas pu restaurer l’aperçu. Recharge la page avant de continuer.",
      );
      setCoherenceLost(true);
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
      await restoreInteraction("J’ai annulé la modification");
      return;
    }
    const selected = pendingInteraction.request.options.find((option) => option.id === selectedId);
    const text = interactionText.trim();
    if (text === "") {
      addMessage("assistant", "Précise ce que tu souhaites corriger pour que je puisse continuer.");
      return;
    }
    const instruction = selected === undefined ? text : `${selected.label} : ${text}`;
    const restored = await restoreInteraction("J’ai préparé une nouvelle tentative");
    if (restored) await runAgent(instruction);
  };

  const restoreRevision = async (revision: RevisionSnapshot): Promise<void> => {
    if (running || coherenceLost || pendingInteraction !== null) return;
    const confirmed = window.confirm(
      `Revenir à « ${revision.label} » ? Les modifications non conservées de l’aperçu seront remplacées.`,
    );
    if (!confirmed) return;
    try {
      const restored = await applyPreview(revision.values);
      const nextObservation = buildAgentObservation({
        values: revision.values,
        render: restored.render,
      });
      currentParamsRef.current = revision.values;
      setObservation(nextObservation);
      setCurrentRevisionId(revision.id);
      setFinalStatus(`État restauré : ${revision.label}`);
      addMessage(
        "assistant",
        `J’ai restauré l’état « ${revision.label} ». Les modifications suivantes ont été annulées.`,
      );
    } catch (error) {
      addMessage(
        "assistant",
        "Je n’ai pas pu restaurer cet état. Recharge la page avant de continuer.",
      );
      log({
        title: "Historique",
        detail: error instanceof Error ? error.message : "Restauration impossible",
        status: "error",
      });
      setCoherenceLost(true);
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
          <span className={styles.eyebrow}>ASSISTANT D’ÉDITION</span>
          <strong>{label}</strong>
          <span className={styles.hint}>
            Brouillon d’aperçu · rien n’est publié automatiquement
          </span>
        </header>

        <div className={styles.chat} aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={styles.message} data-role={message.role}>
              <span className={styles.messageRole}>
                {message.role === "user" ? "Vous" : "Assistant"}
              </span>
              <p>{message.content}</p>
            </article>
          ))}
          {running ? (
            <p className={styles.thinking}>
              {cancelling ? "Annulation en cours…" : "Je travaille sur votre demande…"}
            </p>
          ) : null}
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

        {finalStatus === null ? null : <p className={styles.status}>{finalStatus}</p>}

        <details className={styles.technical}>
          <summary>Détails techniques</summary>
          <div className={styles.logs}>
            {logs.map((entry) => (
              <details
                key={`${entry.title}-${entry.status}-${entry.detail.slice(0, 40)}`}
                className={styles.log}
              >
                <summary>
                  <span className={styles.dot} data-status={entry.status} />
                  {entry.title}
                </summary>
                <p>{entry.detail}</p>
              </details>
            ))}
          </div>
          {observation === null ? null : (
            <pre className={styles.snapshotPre}>
              {JSON.stringify(
                {
                  revision: observation.revision,
                  stateHash: observation.stateHash,
                  counts: observation.counts,
                },
                null,
                2,
              )}
            </pre>
          )}
        </details>

        <details className={styles.revisions}>
          <summary>Historique de l’aperçu ({revisions.length})</summary>
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
        </details>
      </aside>

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
