import type { SessionRepository } from "@/application/ports/session-repository";
import { hashSessionToken } from "@/lib/session-token";

export type LogoutDependencies = {
  sessions: SessionRepository;
};

/** Révoque la session courante (suppression par empreinte de jeton). */
export async function logout(deps: LogoutDependencies, token: string): Promise<void> {
  await deps.sessions.delete(hashSessionToken(token));
}
