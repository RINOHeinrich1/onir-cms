import type { Role, User } from "@/domain/entities/user";

/** Utilisateur porteur de son empreinte de mot de passe (usage interne uniquement). */
export type UserWithCredentials = User & {
  passwordHash: string;
};

export type CreateUserInput = {
  email: string;
  name?: string | null;
  passwordHash: string;
  /** LEGACY (ADR-0025) : miroir du rôle de la membership active. */
  role: Role;
  mustChangePassword: boolean;
  actif: boolean;
  isSuperAdmin?: boolean;
};

export type UpdateUserInput = {
  name?: string | null;
  /** LEGACY : miroir d'affichage ; l'autorisation vient de la membership. */
  role?: Role;
  actif?: boolean;
  passwordHash?: string;
  mustChangePassword?: boolean;
  isSuperAdmin?: boolean;
  lastActiveOrganizationId?: string | null;
};

export interface UserRepository {
  findById(id: string): Promise<UserWithCredentials | null>;
  findByEmail(email: string): Promise<UserWithCredentials | null>;
  list(): Promise<User[]>;
  /** Tous les utilisateurs (super-admin : recherche d'un compte à rattacher). */
  listAll(): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, patch: UpdateUserInput): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  updateLastOrganization(id: string, organizationId: string | null): Promise<void>;
  countSuperAdmins(): Promise<number>;
}

/** Retire l'empreinte de mot de passe avant toute sortie de la couche application. */
export function toPublicUser(record: UserWithCredentials): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name ?? null,
    role: record.role,
    isSuperAdmin: record.isSuperAdmin,
    lastActiveOrganizationId: record.lastActiveOrganizationId,
    mustChangePassword: record.mustChangePassword,
    actif: record.actif,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
