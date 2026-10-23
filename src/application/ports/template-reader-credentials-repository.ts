import type { SealedSecret } from "@/lib/secret-box";

export type TemplateReaderCredentials = {
  userName: string;
  sealed: SealedSecret;
  revision: number;
  rotatedAt: string;
  rotatedBy: string | null;
  /** 0 = pas d'expiration. */
  validityDays: number;
  /** `null` si pas d'expiration. */
  expiresAt: string | null;
};

export interface TemplateReaderCredentialsRepository {
  find(): Promise<TemplateReaderCredentials | null>;
  save(input: {
    sealed: SealedSecret;
    actorId: string | null;
    validityDays: number;
    expiresAt: string | null;
  }): Promise<TemplateReaderCredentials>;
  updatePolicy(input: {
    validityDays: number;
    expiresAt: string | null;
    actorId: string | null;
  }): Promise<TemplateReaderCredentials>;
}
