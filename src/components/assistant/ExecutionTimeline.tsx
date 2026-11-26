"use client";

import type { TemplateEditExecutionEvent } from "@/application/use-cases/visual-templates/template-edit-events";

function statusLabel(status: TemplateEditExecutionEvent["status"]): string {
  if (status === "running") return "en cours";
  if (status === "success") return "ok";
  if (status === "warning") return "attention";
  return "erreur";
}

export function ExecutionTimeline({ events }: { events: TemplateEditExecutionEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="display-assistant-timeline" aria-label="Exécution de l’assistant">
      <div className="display-assistant-timeline-head">
        <strong>Exécution</strong>
        <span className="hint">{events.length} étape(s)</span>
      </div>
      <ol className="display-assistant-timeline-list">
        {events.map((event) => (
          <li
            key={`${event.stage}-${event.status}-${event.startedAt}-${event.attempt ?? "0"}`}
            className={`status-${event.status}`}
          >
            <span className="display-assistant-timeline-dot" aria-hidden="true" />
            <details>
              <summary>
                <span>{event.title}</span>
                <span className="display-assistant-timeline-meta">
                  {typeof event.attempt === "number" ? `essai ${event.attempt}` : null}
                  {typeof event.durationMs === "number" ? ` · ${event.durationMs} ms` : null}
                  {" · "}
                  {statusLabel(event.status)}
                </span>
              </summary>
              {event.summary === undefined ? null : (
                <p className="display-assistant-timeline-summary">{event.summary}</p>
              )}
              {event.detail === undefined ? null : (
                <pre className="display-assistant-technical">
                  {JSON.stringify(event.detail, null, 2)}
                </pre>
              )}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
