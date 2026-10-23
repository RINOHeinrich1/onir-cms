import type { Invitation } from "@/domain/entities/invitation";
import type { Role } from "@/domain/entities/user";

export type CreateInvitationInput = {
  tokenHash: string;
  tokenEnc: string;
  organizationId: string | null;
  role: Role;
  invitedBy: string;
  expiresAt: Date;
};

export type InvitationRecord = Invitation & {
  organizationName: string | null;
  invitedByEmail: string;
  /** Jeton clair déchiffré pour affichage/copie (admin uniquement). */
  token: string | null;
};

export type AcceptInvitationInput = {
  tokenHash: string;
  name: string;
  email: string;
  password: string;
};

export type AcceptInvitationFailure =
  | "invalid"
  | "expired"
  | "revoked"
  | "already_accepted"
  | "invalid_credentials"
  | "inactive"
  | "already_member"
  | "organization_suspended";

export type AcceptInvitationResult =
  | {
      ok: true;
      invitationId: string;
      userId: string;
      organizationId: string;
      organizationName: string;
      role: Role;
      mustChangePassword: boolean;
    }
  | { ok: false; reason: AcceptInvitationFailure };

export interface InvitationRepository {
  create(input: CreateInvitationInput): Promise<InvitationRecord>;
  findById(id: string): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  listForOrganization(organizationId: string): Promise<InvitationRecord[]>;
  listAll(): Promise<InvitationRecord[]>;
  revoke(id: string): Promise<boolean>;
  accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
}
