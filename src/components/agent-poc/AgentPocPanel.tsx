"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateParamValues } from "@/domain/template-params";
import styles from "./AgentPocPanel.module.css";

type PlanResponse = {
  status: "proposed" | "clarification" | "rejected" | "noop";
  values: TemplateParamValues | null;
  proposal: TemplateEditProposal | null;
  warnings: string[];
  attempts: number;
  attemptHistory: Array<{ attempt: number; status: string; errors: string[] }>;
  skills: Array<{ id: string; version: string; confidence: number; reason: string }>;
  clarification: string | null;
  errors: string[];
};

type Observation = {
  text: string;
  header: string;
  main: string;
};

type VerifyResponse = {
  satisfied: boolean;
  reason: string;
  missing: string;
};

type LogEntry = {
  title: string;
  detail: string;
  status: "running" | "success" | "warning" | "error";
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function AgentPocPanel({
  linkId,
  surface,
  initialParams,
  label,
}: {
  linkId: string;
  surface: "page" | "widget";
  initialParams: TemplateParamValues;
  label: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [params, setParams] = useState<TemplateParamValues>(initialParams);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [goal, setGoal] = useState(
    "Ajoute un menu Services et rattache-le à une page Services avec la liste des services.",
  );
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);

  const log = (entry: LogEntry): void => {
    setLogs((current) => [...current, entry]);
  };

  const createPreview = async (
    nextParams: TemplateParamValues,
    token: string | null,
  ): Promise<void> => {
    const response = await fetch(`/api/links/${linkId}/preview-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface, params: nextParams, ...(token === null ? {} : { token }) }),
    });
    if (!response.ok) throw new Error("Impossible de préparer l’aperçu");
    const json = (await response.json()) as { token: string };
    setPreviewToken(json.token);
    setRevision((value) => value + 1);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: l’aperçu initial est créé une seule fois
  useEffect(() => {
    let cancelled = false;
    void createPreview(initialParams, null).catch((error: unknown) => {
      if (!cancelled)
        log({
          title: "Aperçu",
          detail: error instanceof Error ? error.message : "Erreur",
          status: "error",
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waitForPreview = async (): Promise<Document> => {
    for (let index = 0; index < 80; index += 1) {
      const doc = iframeRef.current?.contentDocument;
      const ready = doc?.querySelector('[data-onirtech-ready="1"]');
      const host = doc?.querySelector("onirtech-template-puzzle");
      if (
        doc !== null &&
        doc !== undefined &&
        ready !== null &&
        ready !== undefined &&
        host !== null &&
        host !== undefined
      ) {
        await delay(150);
        return doc;
      }
      await delay(100);
    }
    throw new Error("L’aperçu n’est pas prêt");
  };

  const observe = async (): Promise<Observation> => {
    const doc = await waitForPreview();
    const root = doc.querySelector("onirtech-template-puzzle")?.shadowRoot;
    if (root === null || root === undefined) throw new Error("Shadow DOM indisponible");
    return {
      text: (root.textContent ?? "").slice(0, 12_000),
      header: root.querySelector("header")?.innerText ?? "",
      main: root.querySelector("main")?.innerText ?? "",
    };
  };

  const applyPreview = async (nextParams: TemplateParamValues): Promise<Observation> => {
    setParams(nextParams);
    await createPreview(nextParams, previewToken);
    const observation = await observe();
    setObservation(observation);
    return observation;
  };

  const plan = async (request: string, values: TemplateParamValues): Promise<PlanResponse> => {
    const response = await fetch(`/api/links/${linkId}/agent-poc/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, params: values, surface }),
    });
    if (!response.ok) throw new Error("Le planner a échoué");
    return (await response.json()) as PlanResponse;
  };

  const verify = async (target: string, snapshot: Observation): Promise<VerifyResponse> => {
    const response = await fetch(`/api/links/${linkId}/agent-poc/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: target, observation: snapshot }),
    });
    if (!response.ok) throw new Error("La vérification a échoué");
    return (await response.json()) as VerifyResponse;
  };

  const runAgent = async (): Promise<void> => {
    if (running || goal.trim() === "") return;
    setRunning(true);
    setFinalStatus(null);
    setLogs([]);
    let current = params;
    let lastReason = "";
    try {
      log({ title: "Observation initiale", detail: "Lecture de l’aperçu réel", status: "running" });
      let snapshot = await observe();
      setObservation(snapshot);
      log({
        title: "Observation initiale",
        detail: snapshot.header.slice(0, 500),
        status: "success",
      });

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const request =
          lastReason === "" ? goal : `${goal}\n\nÉchec observé précédent : ${lastReason}`;
        log({ title: `Tentative ${attempt}/10`, detail: "Planification", status: "running" });
        const planned = await plan(request, current);
        for (const history of planned.attemptHistory) {
          log({
            title: `Plan ${history.attempt}`,
            detail: history.status === "error" ? history.errors.join(" ; ") : "Plan accepté",
            status: history.status === "error" ? "error" : "success",
          });
        }
        if (planned.status === "clarification") {
          log({
            title: "Clarification",
            detail: planned.clarification ?? "Précision requise",
            status: "warning",
          });
          setFinalStatus("Clarification requise");
          return;
        }
        if (planned.status === "rejected" || planned.status === "noop" || planned.values === null) {
          log({
            title: "Plan non applicable",
            detail:
              planned.errors.join(" ; ") || planned.warnings.join(" ; ") || "Aucune opération",
            status: planned.status === "noop" ? "success" : "error",
          });
          setFinalStatus(
            planned.status === "noop" ? "Aucune modification nécessaire" : "Échec du plan",
          );
          return;
        }
        log({
          title: "Plan accepté",
          detail: `${planned.proposal?.operations.length ?? 0} opération(s) — ${planned.skills.map((skill) => skill.id).join(", ")}`,
          status: "success",
        });
        current = planned.values;
        snapshot = await applyPreview(current);
        log({
          title: `Après application ${attempt}`,
          detail: snapshot.header.slice(0, 500),
          status: "success",
        });
        const checked = await verify(goal, snapshot);
        log({
          title: `Vérification ${attempt}`,
          detail: checked.satisfied ? checked.reason : checked.missing || checked.reason,
          status: checked.satisfied ? "success" : "warning",
        });
        if (checked.satisfied) {
          setFinalStatus("Objectif atteint dans le brouillon d’aperçu");
          return;
        }
        lastReason = checked.missing || checked.reason;
      }
      setFinalStatus("Objectif non atteint après 10 tentatives");
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
            <summary>Observation du header</summary>
            <pre>{observation.header}</pre>
            <pre>{observation.main.slice(0, 2000)}</pre>
          </details>
        )}
      </aside>
      <section className={styles.preview}>
        {previewSrc === "" ? (
          <p>Préparation de l’aperçu…</p>
        ) : (
          <iframe ref={iframeRef} src={previewSrc} title="Aperçu agent" />
        )}
      </section>
    </main>
  );
}
