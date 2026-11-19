export type EmailSettingsStatus = "active" | "disabled";
export type EmailSettingsSource = "organization" | "platform";

export type EmailSettingsInput = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  /** Vide = conserver le secret existant. */
  password?: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  status: EmailSettingsStatus;
};

export type StoredEmailSettings = EmailSettingsInput & {
  source: EmailSettingsSource;
  organizationId: string | null;
  passwordEnc: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string;
};

export type PublicEmailSettings = Omit<StoredEmailSettings, "passwordEnc" | "password"> & {
  passwordConfigured: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function publicEmailSettings(settings: StoredEmailSettings): PublicEmailSettings {
  const { passwordEnc, password: _password, ...rest } = settings;
  return { ...rest, passwordConfigured: passwordEnc !== "" };
}

export function validateEmailSettings(input: EmailSettingsInput): string[] {
  const errors: string[] = [];
  const host = input.host.trim();
  if (host === "" || host.length > 255 || !HOST_PATTERN.test(host)) {
    errors.push("Hôte SMTP invalide");
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    errors.push("Port SMTP invalide");
  }
  if (!EMAIL_PATTERN.test(input.fromEmail.trim()) || input.fromEmail.length > 320) {
    errors.push("Adresse expéditrice invalide");
  }
  if (input.replyTo.trim() !== "" && !EMAIL_PATTERN.test(input.replyTo.trim())) {
    errors.push("Adresse de réponse invalide");
  }
  if (input.fromName.length > 120) errors.push("Nom expéditeur trop long");
  if (input.username.length > 320) errors.push("Utilisateur SMTP trop long");
  if ((input.password ?? "").length > 500) errors.push("Mot de passe SMTP trop long");
  return errors;
}
