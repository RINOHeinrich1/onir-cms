import type { SealedSecret } from "@/lib/secret-box";
import type { TemplateReaderCredentials } from "./template-reader-credentials-repository";

export type RotateReaderAccountInput = {
  password: string;
  validUntil: Date | null;
  sealed: SealedSecret;
  actorId: string | null;
  validityDays: number;
  expiresAt: string | null;
};

export type SetReaderValidityInput = {
  validUntil: Date | null;
  validityDays: number;
  expiresAt: string | null;
  actorId: string | null;
};

/**
 * Mutations atomiques du compte lecteur : le rôle PostgreSQL et le secret
 * chiffré sont modifiés dans la même transaction (rollback complet en cas
 * d'échec, jamais de rôle avec un secret différent).
 */
export interface TemplateReaderAccountStore {
  rotate(input: RotateReaderAccountInput): Promise<TemplateReaderCredentials>;
  setValidity(input: SetReaderValidityInput): Promise<TemplateReaderCredentials>;
}
