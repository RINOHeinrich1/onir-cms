/**
 * Erreurs applicatives typées — mappées vers des statuts HTTP par la couche API.
 * Aucune fuite de détail d'infrastructure vers le client.
 */

export class AppError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Requête invalide") {
    super(message, 400);
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

/** Le lien (ou le défaut d'organisation) désigne un fournisseur/modèle indisponible. */
export class AiProviderUnavailableError extends AppError {
  constructor(message = "Fournisseur IA indisponible — réaffectez le lien") {
    super(message, 409);
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
