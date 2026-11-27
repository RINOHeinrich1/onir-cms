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
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function logStatus(status: AgentLoopEvent["status"]): LogEntry["status"] {
  return status;
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
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [goal, setGoal] = useState(
    "Ajoute un menu Services et rattache-le à une page Services avec la liste des services.",
  );
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [observation, setObservation] = useState<AgentObservation | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<PendingInteraction | null>(null);
  const [interactionText, setInteractionText] = useState("");
  const [finalStatus, setFinalStatus] = useState<string | null>(null);

  const log = (entry: LogEntry): void => {
    setLogs((current) => [...current, entry]);
  };

  const createPreview = async (
    nextParams: TemplateParamValues,
    token: string | null,
  ): Promise<{ token: string; revision: number }> => {
    const template =
      templateId === null || templateVersion === null
        ? undefined
        : `${templateId}@${templateVersion}`;
    const response = await fetch(`/api/links/${linkId}/preview-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface,
        params: nextParams,
        ...(template === undefined ? {} : { template }),
        ...(token === null ? {} : { token }),
      }),
    });
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

  const waitForIframeLoad = async (previousCount: number): Promise<void> => {
    for (let index = 0; index < 160; index += 1) {
      if (iframeLoadRef.current > previousCount) return;
      await delay(100);
    }
    throw new Error("Le nouvel aperçu ne s’est pas chargé");
  };

  const waitForPreview = async (
    expectedToken?: string,
    expectedRevision?: number,
  ): Promise<Document> => {
    for (let index = 0; index < 100; index += 1) {
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
        return doc;
      }
      await delay(100);
    }
    throw new Error("L’aperçu n’est pas prêt");
  };

  const readRender = async (
    expectedToken?: string,
    expectedRevision?: number,
  ): Promise<AgentRenderObservation> => {
    const doc = await waitForPreview(expectedToken, expectedRevision);
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
  ): Promise<{ token: string; render: AgentRenderObservation }> => {
    const previousLoad = iframeLoadRef.current;
    const token = currentTokenRef.current;
    const next = await createPreview(values, token);
    await waitForIframeLoad(previousLoad);
    const render = await readRender(next.token, next.revision);
    currentTokenRef.current = next.token;
    return { token: next.token, render };
  };

  const observeValues = async (values: TemplateParamValues): Promise<AgentObservation> => {
    const render = await readRender();
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
    const response = await fetchWithTimeout(
      `/api/links/${linkId}/agent-poc/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: input.rawPlan,
          params: input.values,
          surface,
          request: goal,
        }),
      },
      PLAN_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error("L’exécution du plan a échoué");
    return (await response.json()) as ExecuteResponse;
  };

  const verify = async (input: {
    goal: string;
    observation: AgentObservation;
    execution: AgentExecutionOutcome;
  }): Promise<AgentVerifyOutcome> => {
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
    );
    if (!response.ok) throw new Error("La vérification a échoué");
    return (await response.json()) as AgentVerifyOutcome;
  };

  const emit = (event: AgentLoopEvent): void => {
    log({
      title: event.title,
      detail: event.detail ?? "",
      status: logStatus(event.status),
    });
  };

  const runAgent = async (userInstruction = ""): Promise<void> => {
    if (running || goal.trim() === "") return;
    setRunning(true);
    setFinalStatus(null);
    setLogs([]);
    setPendingInteraction(null);
    setInteractionText("");
    const values = currentParamsRef.current;
    const effectiveGoal =
      userInstruction === "" ? goal : `${goal}\n\nPrécision utilisateur : ${userInstruction}`;

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
            const applied = await applyPreview(candidateValues);
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

      if (result.status === "success") {
        currentParamsRef.current = result.values;
        setFinalStatus("Objectif atteint dans le brouillon d’aperçu");
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
        setFinalStatus("Validation utilisateur requise");
      } else if (result.status === "clarification") {
        setPendingInteraction({
          request: result.interaction,
          values: null,
          observation: null,
          baseValues: currentParamsRef.current,
          baseObservation: result.observation,
          lastAttempt: result.lastAttempt,
        });
        setFinalStatus("Clarification requise");
      } else {
        setFinalStatus(`${result.status} : ${result.reason}`);
      }
    } catch (error) {
      log({
        title: "Erreur",
        detail: error instanceof Error ? error.message : "Erreur inconnue",
        status: "error",
      });
      setFinalStatus("Erreur");
    } finally {
      setRunning(false);
    }
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
    setPendingInteraction(null);
    setFinalStatus("Résultat conservé dans le brouillon d’aperçu");
    log({
      title: "Interaction : garder",
      detail: "Le candidat reste appliqué dans l’aperçu.",
      status: "success",
    });
  };

  const restoreInteraction = async (label: string): Promise<void> => {
    if (pendingInteraction === null) return;
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
      log({
        title: `Interaction : ${label}`,
        detail: "L’état committed a été restauré.",
        status: "warning",
      });
    } catch (error) {
      log({
        title: "Interaction",
        detail: error instanceof Error ? error.message : "Restauration impossible",
        status: "error",
      });
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
      await restoreInteraction("Annulé");
      return;
    }
    const selected = pendingInteraction.request.options.find((option) => option.id === selectedId);
    const text = interactionText.trim();
    if (text === "") {
      log({
        title: "Interaction : réponse requise",
        detail: "Précisez votre correction ou votre choix.",
        status: "warning",
      });
      return;
    }
    const instruction = selected === undefined ? text : `${selected.label} : ${text}`;
    await restoreInteraction("Correction demandée");
    await runAgent(instruction);
  };

  const previewSrc =
    previewToken === null
      ? ""
      : `/liens/${linkId}/apercu?embed=1&surface=${surface}&preview=${encodeURIComponent(previewToken)}&v=${revision}`;

  return (
    <main className={styles.shell}>
      <aside className={styles.panel}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>POC AGENT IA</span>
          <strong>{label}</strong>
          <span className={styles.hint}>Brouillon d’aperçu uniquement</span>
        </header>
        <textarea
          className={styles.goal}
          rows={4}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
        <button
          type="button"
          className={styles.run}
          disabled={running || previewToken === null}
          onClick={() => void runAgent()}
        >
          {running ? "Agent en cours…" : "Lancer l’agent"}
        </button>
        {finalStatus === null ? null : <p className={styles.status}>{finalStatus}</p>}
        {pendingInteraction === null ? null : (
          <div className={styles.interaction}>
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
              className={styles.goal}
              rows={3}
              value={interactionText}
              onChange={(event) => setInteractionText(event.target.value)}
              placeholder="Précisez votre réponse ou la correction à appliquer…"
            />
            <button
              type="button"
              className={styles.cancel}
              onClick={() => void submitInteraction(defaultInteractionOption())}
            >
              Envoyer la précision
            </button>
          </div>
        )}
        <div className={styles.logs}>
          {logs.map((entry) => (
            <details
              key={`${entry.title}-${entry.status}-${entry.detail.slice(0, 40)}`}
              className={styles.log}
              open={entry.status === "running"}
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
          <details className={styles.snapshot}>
            <summary>Observation structurée</summary>
            <pre>
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
            <pre>{observation.render.header}</pre>
            <pre>{observation.render.main.slice(0, 2000)}</pre>
          </details>
        )}
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
