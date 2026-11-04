import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

export type LimitProfile = {
  id: string;
  name: string;
  description: string;
  provisioning: OrganizationProvisioning;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateLimitProfileInput = {
  name: string;
  description: string;
  provisioning: OrganizationProvisioning;
  active: boolean;
  createdBy: string;
};

export type UpdateLimitProfileInput = {
  name?: string;
  description?: string;
  provisioning?: OrganizationProvisioning;
  active?: boolean;
};

export interface LimitProfileRepository {
  list(includeInactive?: boolean): Promise<LimitProfile[]>;
  findById(id: string): Promise<LimitProfile | null>;
  create(input: CreateLimitProfileInput): Promise<LimitProfile>;
  update(id: string, input: UpdateLimitProfileInput): Promise<LimitProfile | null>;
  delete(id: string): Promise<boolean>;
  /** Propage le profil à toutes les organisations liées, sans reset comptable. */
  syncToOrganizations(profile: LimitProfile, appliedBy: string): Promise<void>;
  /** Assigne le profil à une organisation et l'applique immédiatement. */
  applyToOrganization(
    organizationId: string,
    profileId: string,
    appliedBy: string,
  ): Promise<LimitProfile | null>;
}
