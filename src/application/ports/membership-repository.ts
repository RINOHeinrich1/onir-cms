import type { Membership, MembershipRole } from "@/domain/entities/organization";

export type UpsertMembershipInput = {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdBy: string | null;
};

/** Port de persistance des memberships (rôle par organisation, ADR-0025 §3). */
export interface MembershipRepository {
  findRole(organizationId: string, userId: string): Promise<MembershipRole | null>;
  findByOrganizationAndUser(organizationId: string, userId: string): Promise<Membership | null>;
  listForUser(userId: string): Promise<Membership[]>;
  listForOrganization(organizationId: string): Promise<Membership[]>;
  upsert(input: UpsertMembershipInput): Promise<Membership>;
  updateRole(
    organizationId: string,
    userId: string,
    role: MembershipRole,
  ): Promise<Membership | null>;
  remove(organizationId: string, userId: string): Promise<boolean>;
  countAdmins(organizationId: string): Promise<number>;
  countForUser(userId: string): Promise<number>;
}
