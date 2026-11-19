import { ValidationError } from "@/application/errors";
import type { EmailSender } from "@/application/ports/email-sender";
import type { EmailSettingsRepository } from "@/application/ports/email-settings-repository";
import type {
  EmailSettingsInput,
  PublicEmailSettings,
  StoredEmailSettings,
} from "@/domain/entities/email-settings";
import { publicEmailSettings, validateEmailSettings } from "@/domain/entities/email-settings";
import { openEmailSecret } from "@/infrastructure/config/email-secret-crypto";
import {
  type SmtpTransportSettings,
  smtpEmailSender,
} from "@/infrastructure/email/smtp-email-sender";

export type ResolvedEmailTransport = SmtpTransportSettings & {
  source: "organization" | "platform";
  settings: PublicEmailSettings;
};

function asTransport(settings: StoredEmailSettings): ResolvedEmailTransport {
  const scope = settings.source === "platform" ? "platform" : `org:${settings.organizationId}`;
  return {
    source: settings.source,
    settings: publicEmailSettings(settings),
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username,
    password: openEmailSecret(scope, settings.passwordEnc),
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
  };
}

export async function resolveEmailTransport(
  repository: EmailSettingsRepository,
  organizationId: string,
): Promise<ResolvedEmailTransport> {
  const organization = await repository.findOrganization(organizationId);
  if (organization !== null) {
    if (organization.status !== "active" || organization.host.trim() === "") {
      throw new ValidationError("Le SMTP de cette organisation est désactivé ou incomplet");
    }
    return asTransport(organization);
  }
  const platform = await repository.findPlatform();
  if (platform !== null && platform.status === "active" && platform.host.trim() !== "") {
    return asTransport(platform);
  }
  throw new ValidationError("Aucun transport email n'est configuré pour cette organisation");
}

export async function getOrganizationEmailSettings(
  repository: EmailSettingsRepository,
  organizationId: string,
): Promise<PublicEmailSettings | null> {
  const settings = await repository.findOrganization(organizationId);
  return settings === null ? null : publicEmailSettings(settings);
}

export async function saveOrganizationEmailSettings(
  repository: EmailSettingsRepository,
  organizationId: string,
  actorId: string,
  input: EmailSettingsInput,
): Promise<PublicEmailSettings> {
  const errors = validateEmailSettings(input);
  if (errors.length > 0) throw new ValidationError(errors[0]);
  return publicEmailSettings(await repository.upsertOrganization(organizationId, input, actorId));
}

export async function getPlatformEmailSettings(
  repository: EmailSettingsRepository,
): Promise<PublicEmailSettings | null> {
  const settings = await repository.findPlatform();
  return settings === null ? null : publicEmailSettings(settings);
}

export async function savePlatformEmailSettings(
  repository: EmailSettingsRepository,
  actorId: string,
  input: EmailSettingsInput,
): Promise<PublicEmailSettings> {
  const errors = validateEmailSettings(input);
  if (errors.length > 0) throw new ValidationError(errors[0]);
  return publicEmailSettings(await repository.upsertPlatform(input, actorId));
}

export async function sendTestEmail(
  repository: EmailSettingsRepository,
  organizationId: string,
  to: string,
): Promise<PublicEmailSettings> {
  const transport = await resolveEmailTransport(repository, organizationId);
  const sender: EmailSender = smtpEmailSender(transport);
  try {
    await sender.send({
      to,
      subject: "Test SMTP — ONIR CMS",
      text: "Ceci est un email de test du transport SMTP ONIR CMS.",
      html: "<p>Ceci est un email de test du transport SMTP ONIR CMS.</p>",
    });
    await repository.recordTest(
      transport.source === "organization" ? organizationId : null,
      true,
      null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l'envoi";
    await repository.recordTest(
      transport.source === "organization" ? organizationId : null,
      false,
      message.slice(0, 500),
    );
    throw new ValidationError(`Test SMTP échoué : ${message.slice(0, 200)}`);
  }
  return transport.settings;
}

export async function sendPlatformTestEmail(
  repository: EmailSettingsRepository,
  to: string,
): Promise<PublicEmailSettings> {
  const settings = await repository.findPlatform();
  if (settings === null || settings.status !== "active" || settings.host.trim() === "") {
    throw new ValidationError("Aucun SMTP plateforme actif n'est configuré");
  }
  const transport = asTransport(settings);
  const sender: EmailSender = smtpEmailSender(transport);
  try {
    await sender.send({
      to,
      subject: "Test SMTP plateforme — ONIR CMS",
      text: "Ceci est un email de test du SMTP par défaut ONIR CMS.",
      html: "<p>Ceci est un email de test du SMTP par défaut ONIR CMS.</p>",
    });
    await repository.recordTest(null, true, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de l'envoi";
    await repository.recordTest(null, false, message.slice(0, 500));
    throw new ValidationError(`Test SMTP échoué : ${message.slice(0, 200)}`);
  }
  return transport.settings;
}
