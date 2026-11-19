export type OtpChallenge = {
  id: string;
  organizationId: string;
  linkId: string;
  channel: "page" | "widget";
  surface: "page" | "widget";
  email: string;
  emailHash: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  consentement: boolean;
  consumedAt: string | null;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export type CreateOtpChallengeInput = {
  organizationId: string;
  linkId: string;
  channel: "page" | "widget";
  surface: "page" | "widget";
  email: string;
  emailHash: string;
  codeHash: string;
  expiresAt: string;
  maxAttempts: number;
  consentement: boolean;
  ip: string;
  userAgent: string;
};

export type OtpVerifyResult =
  | { status: "valid"; challenge: OtpChallenge }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "too_many_attempts" };
