export class AgentTimeoutError extends Error {
  constructor(
    readonly phase: string,
    readonly timeoutMs: number,
    readonly elapsedMs: number,
  ) {
    super(
      `Délai de ${Math.round(elapsedMs / 1000)} s dépassé (limite ${Math.round(timeoutMs / 1000)} s) pendant ${phase}`,
    );
    this.name = "AgentTimeoutError";
  }
}

export class AgentCancelledError extends Error {
  constructor(readonly phase: string) {
    super("Demande annulée");
    this.name = "AgentCancelledError";
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
  phase: string,
): Promise<Response> {
  const controller = new AbortController();
  const startedAt = performance.now();
  const state = { timedOut: false };
  const abort = (): void => controller.abort();
  if (externalSignal?.aborted === true) throw new AgentCancelledError(phase);
  externalSignal?.addEventListener("abort", abort);
  const timeout = window.setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (state.timedOut) {
      throw new AgentTimeoutError(phase, timeoutMs, performance.now() - startedAt);
    }
    if (externalSignal !== undefined && externalSignal.aborted) {
      throw new AgentCancelledError(phase);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}
