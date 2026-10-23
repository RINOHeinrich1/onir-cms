import type { Organization } from "@/domain/entities/organization";
import type { User } from "@/domain/entities/user";

export type Session = {
  id: string;
  tokenHash: string;
  userId: string;
  /** Organisation active de la session (ADR-0025 §4) ; null = aucune. */
  activeOrganizationId: string | null;
  expiresAt: string;
  createdAt: string;
};

export type SessionWithUser = {
  session: Session;
  user: User;
  /** Organisation active résolue (null si aucune ou si supprimée). */
  organization: Organization | null;
};

export type CreateSessionInput = {
  tokenHash: string;
  userId: string;
  activeOrganizationId: string | null;
  expiresAt: Date;
};

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<SessionWithUser | null>;
  /** Met à jour l'organisation active d'une session (bascule, ADR-0025 §4). */
  setActiveOrganization(sessionId: string, organizationId: string | null): Promise<void>;
  delete(tokenHash: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}
