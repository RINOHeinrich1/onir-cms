import { createHash, createHmac, randomInt } from "node:crypto";
import { BadGatewayError, OtpRateLimitError, ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { EmailSender } from "@/application/ports/email-sender";
import type { EmailSettingsRepository } from "@/application/ports/email-settings-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { OtpChallengeRepository } from "@/application/ports/otp-challenge-repository";
import { resolveEmailTransport } from "@/application/use-cases/email/email-settings-service";
import { type ChatLinkSurface, channelsForLink } from "@/domain/entities/chat";
import type { OtpChallenge } from "@/domain/entities/otp";
import { hashLinkToken } from "@/domain/link-token";
import { sessionSecret } from "@/infrastructure/config/app-secrets";
import { smtpEmailSender } from "@/infrastructure/email/smtp-email-sender";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export type EmailOtpDependencies = {
  links: ChatLinkRepository;
  organizations: OrganizationRepository;
  challenges: OtpChallengeRepository;
  emailSettings: EmailSettingsRepository;
};

export type OtpChallengeView = {
  challengeId: string;
  expiresAt: string;
  transport: "organization" | "platform";
};

type RequestInput = {
  token: string;
  email: string;
  consentement: boolean;
  surface: ChatLinkSurface;
  ip: string;
  userAgent: string;
};

function codeHash(code: string): string {
  return createHmac("sha256", sessionSecret()).update(code).digest("hex");
}

function emailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function since(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function loadLink(deps: EmailOtpDependencies, token: string) {
  if (token.trim() === "") throw new ValidationError("Lien invalide");
  const link = await deps.links.findByTokenHash(hashLinkToken(token.trim()));
  if (link === null || !link.actif) throw new ValidationError("Lien invalide ou révoqué");
  if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now()) {
    throw new ValidationError("Lien expiré");
  }
  const organization = await deps.organizations.findById(link.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    throw new ValidationError("Lien invalide ou révoqué");
  }
  return link;
}

function requireOtpChannel(link: Awaited<ReturnType<typeof loadLink>>, surface: ChatLinkSurface) {
  const channel = channelsForLink(link)[surface];
  if (!channel.enabled || channel.identificationMode !== "otp") {
    throw new ValidationError("Mode d'identification indisponible");
  }
  if (surface !== "page") {
    throw new ValidationError("L'identification OTP est disponible sur la page uniquement");
  }
  return channel;
}

export async function requestEmailOtp(
  deps: EmailOtpDependencies,
  input: RequestInput,
): Promise<OtpChallengeView> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new ValidationError("Email invalide");
  }
  const link = await loadLink(deps, input.token);
  const channel = requireOtpChannel(link, input.surface);
  if (channel.confidentialiteId !== null && !input.consentement) {
    throw new ValidationError("Vous devez accepter la politique de confidentialité");
  }
  const hash = emailHash(email);
  const [emailCooldown, emailRecent, linkRecent, ipRecent] = await Promise.all([
    deps.challenges.countRecentByEmail(hash, since(1)),
    deps.challenges.countRecentByEmail(hash, since(15)),
    deps.challenges.countRecentByLink(link.id, since(15)),
    input.ip === "" ? Promise.resolve(0) : deps.challenges.countRecentByIp(input.ip, since(15)),
  ]);
  if (emailCooldown > 0)
    throw new OtpRateLimitError(
      "Patientez avant de demander un nouveau code",
      RESEND_COOLDOWN_SECONDS,
    );
  if (emailRecent >= 3)
    throw new OtpRateLimitError("Trop de codes demandés pour cet email", 15 * 60);
  if (linkRecent >= 10) throw new OtpRateLimitError("Trop de codes demandés pour ce lien", 15 * 60);
  if (ipRecent >= 20)
    throw new OtpRateLimitError("Trop de codes demandés depuis cette adresse", 15 * 60);

  const transport = await resolveEmailTransport(deps.emailSettings, link.organizationId);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const challenge = await deps.challenges.create({
    organizationId: link.organizationId,
    linkId: link.id,
    channel: "page",
    surface: "page",
    email,
    emailHash: hash,
    codeHash: codeHash(code),
    expiresAt,
    maxAttempts: MAX_ATTEMPTS,
    consentement: input.consentement,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  const label = link.label.trim() === "" ? "votre conversation" : link.label.trim();
  const sender: EmailSender = smtpEmailSender(transport);
  try {
    await sender.send({
      to: email,
      subject: `Votre code de vérification — ${label}`,
      text: `Votre code de vérification est : ${code}\n\nIl expire dans 10 minutes et ne peut être utilisé qu'une fois.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
      html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Il expire dans 10 minutes et ne peut être utilisé qu'une fois.</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    });
  } catch {
    throw new BadGatewayError("L'envoi du code a échoué, réessayez dans un instant");
  }
  return { challengeId: challenge.id, expiresAt, transport: transport.source };
}

export type VerifyOtpResult = {
  challenge: OtpChallenge;
  emailVerifiedAt: string;
};

export async function verifyEmailOtp(
  deps: EmailOtpDependencies,
  input: { token: string; challengeId: string; code: string; surface: ChatLinkSurface },
): Promise<VerifyOtpResult> {
  if (!/^\d{6}$/.test(input.code.trim())) throw new ValidationError("Code invalide");
  const link = await loadLink(deps, input.token);
  requireOtpChannel(link, input.surface);
  const challenge = await deps.challenges.findById(input.challengeId);
  if (
    challenge === null ||
    challenge.linkId !== link.id ||
    challenge.organizationId !== link.organizationId
  ) {
    throw new ValidationError("Code invalide ou expiré");
  }
  if (challenge.consumedAt !== null) throw new ValidationError("Code déjà utilisé");
  if (new Date(challenge.expiresAt).getTime() <= Date.now())
    throw new ValidationError("Code expiré");
  if (challenge.attempts >= challenge.maxAttempts) throw new ValidationError("Trop de tentatives");
  const consumed = await deps.challenges.consume(challenge.id, codeHash(input.code.trim()));
  if (consumed === null) {
    await deps.challenges.incrementAttempts(challenge.id);
    throw new ValidationError("Code invalide ou expiré");
  }
  return { challenge: consumed, emailVerifiedAt: new Date().toISOString() };
}
