import type { Role } from "@/domain/entities/user";

/** Vue client d'un membre de l'organisation active (sans secret). */
export type UserDto = {
  userId: string;
  email: string;
  /** Rôle de la membership active (jamais `users.role`). */
  role: Role;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  actif: boolean;
  createdAt: string;
  /** Portée des conversations d'un opérateur chat (ADR-0043). */
  chatScope?: { allLinks: boolean; linkIds: string[] } | null;
};

export type MembershipDto = {
  organizationId: string;
  organizationName: string;
  role: Role;
};
