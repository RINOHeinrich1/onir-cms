export type TemplateEditExecutionStatus = "running" | "success" | "warning" | "error";

export type TemplateEditExecutionEvent = {
  stage: string;
  status: TemplateEditExecutionStatus;
  title: string;
  summary?: string;
  attempt?: number;
  maxAttempts?: number;
  detail?: unknown;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
};

export type TemplateEditEventSink = (event: TemplateEditExecutionEvent) => void;

export function emitTemplateEditEvent(
  sink: TemplateEditEventSink | undefined,
  event: TemplateEditExecutionEvent,
): void {
  sink?.(event);
}
