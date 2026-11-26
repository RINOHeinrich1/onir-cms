/**
 * Erreurs applicatives typées — mappées vers des statuts HTTP par la couche API.
 * Aucune fuite de détail d'infrastructure vers le client.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Requête invalide") {
    super(message, 400);
  }
}

/** Échec de génération d’une proposition IA, avec la réponse brute pour l’audit. */
export class TemplateEditGenerationError extends ValidationError {
  readonly rawResponse: unknown;
  readonly validationErrors: string[];

  constructor(message: string, rawResponse: unknown, validationErrors: string[] = []) {
    super(message);
    this.name = "TemplateEditGenerationError";
    this.rawResponse = rawResponse;
    this.validationErrors = validationErrors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentification requise") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Accès refusé") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Ressource introuvable") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflit") {
    super(message, 409);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = "Informations insuffisantes") {
    super(message, 422);
  }
}

export class BadGatewayError extends AppError {
  constructor(message = "Service momentanément indisponible") {
    super(message, 502);
  }
}

/** Aucun fournisseur IA résolu (ni lien, ni organisation, ni legacy). */
export class AiNotConfiguredError extends AppError {
  constructor(message = "Aucun fournisseur IA configuré") {
    super(message, 503);
  }
}

/** Capacité IA momentanément saturée ou limiteur indisponible (ADR-0079). */
export class AiRateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(
    message = "Capacité IA temporairement saturée — réessayez dans un instant",
    retryAfterSeconds = 5,
  ) {
    super(message, 503);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Le lien (ou le défaut d'organisation) désigne un fournisseur/modèle indisponible. */
export class AiProviderUnavailableError extends AppError {
  constructor(message = "Fournisseur IA indisponible — réaffectez le lien") {
    super(message, 409);
  }
}

/** Le chatbot a atteint un quota (fiches ou tokens) — ADR-0048. */
export class ChatbotBlockedError extends AppError {
  constructor(message = "Ce chatbot est temporairement indisponible") {
    super(message, 423);
  }
}

/** L'organisation (ou une cible IA) a atteint son budget de tokens — ADR-0065. */
export class AiQuotaExceededError extends AppError {
  constructor(message = "Le budget IA de cette organisation est épuisé") {
    super(message, 423);
  }
}

/** L'organisation a atteint son nombre maximal de chatbots — ADR-0065. */
export class OrganizationChatbotLimitError extends AppError {
  constructor(message = "Cette organisation a atteint son nombre maximal de chatbots") {
    super(message, 423);
  }
}

/** Aucune organisation active : état « aucune organisation » (ADR-0025 §4). */
export class NoOrganizationError extends AppError {
  constructor(message = "Aucune organisation active") {
    super(message, 403);
  }
}

/** Organisation suspendue : accès refusé (jamais une erreur 500). */
export class OrganizationSuspendedError extends AppError {
  constructor(message = "Organisation suspendue") {
    super(message, 403);
  }
}

export class StorageQuotaExceededError extends AppError {
  constructor(message: string) {
    super(message, 413);
    this.name = "StorageQuotaExceededError";
  }
}

/** Le stockage des fichiers refuse l'écriture (espace insuffisant, S3 indisponible). */
export class StorageUnavailableError extends AppError {
  readonly cause: unknown;

  constructor(
    message = "Stockage des fichiers indisponible : espace insuffisant ou service de stockage en erreur. Réessayez après libération de l’espace.",
    cause?: unknown,
  ) {
    super(message, 503, "STORAGE_UNAVAILABLE");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

/** Le template est encore utilisé par au moins un chatbot (ADR-0091 §6). */
export class TemplateInUseError extends AppError {
  readonly usages: number;
  readonly templateName: string;

  constructor(templateName: string, usages: number) {
    super(
      `Impossible de désinstaller « ${templateName} » : ${usages} chatbot(s) l’utilisent encore. Modifiez leur template avant de réessayer.`,
      409,
      "TEMPLATE_IN_USE",
    );
    this.templateName = templateName;
    this.usages = usages;
  }
}

/** Une version de template est encore référencée par un lien ou une donnée (ADR-0103). */
export class TemplateVersionInUseError extends AppError {
  readonly usage: { links: number; bindings: number; assets: number };

  constructor(version: string, usage: { links: number; bindings: number; assets: number }) {
    const details = [
      usage.links > 0 ? `${usage.links} lien(s)` : null,
      usage.bindings > 0 ? `${usage.bindings} configuration(s) de données` : null,
    ].filter((entry): entry is string => entry !== null);
    super(
      `Impossible de désinstaller la version ${version} : ${details.join(" et ")} la référence(nt) encore.`,
      409,
      "TEMPLATE_VERSION_IN_USE",
    );
    this.usage = usage;
  }
}

/** Une version ne remplit pas les conditions de désinstallation (ADR-0103). */
export class TemplateVersionNotUninstallableError extends AppError {
  constructor(message: string) {
    super(message, 409, "TEMPLATE_VERSION_NOT_UNINSTALLABLE");
  }
}

/** L'organisation a atteint la limite de templates propriétaires (ADR-0091 §3). */
export class TemplateLimitReachedError extends AppError {
  readonly limit: number;

  constructor(limit: number) {
    super(`Limite de ${limit} templates propriétaires atteinte`, 409, "TEMPLATE_LIMIT_REACHED");
    this.limit = limit;
  }
}

/** Une clé réservée au catalogue plateforme a été utilisée (ADR-0091 §8). */
export class TemplateKeyReservedError extends AppError {
  constructor(key: string) {
    super(`La clé « ${key} » est réservée aux templates plateforme`, 400, "TEMPLATE_KEY_RESERVED");
  }
}

/** Trop de demandes OTP (email, lien ou IP) — ADR-0099. */
export class OtpRateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(message = "Trop de demandes de code, réessayez plus tard", retryAfterSeconds = 60) {
    super(message, 429, "OTP_RATE_LIMITED");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
