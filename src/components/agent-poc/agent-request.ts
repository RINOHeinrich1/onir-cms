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

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
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
  if (isAborted(externalSignal)) throw new AgentCancelledError(phase);
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
    if (isAborted(externalSignal)) {
      throw new AgentCancelledError(phase);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

export class AgentHttpError extends Error {
  constructor(
    readonly phase: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`Erreur HTTP ${status} pendant ${phase}: ${body.slice(0, 300)}`);
    this.name = "AgentHttpError";
  }
}

export async function requireOk(response: Response, phase: string): Promise<Response> {
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  throw new AgentHttpError(phase, response.status, body);
}
