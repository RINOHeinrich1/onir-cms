import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

export type PlatformOffer = {
  id: string;
  name: string;
  description: string;
  provisioning: OrganizationProvisioning;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlatformOfferInput = {
  name: string;
  description: string;
  provisioning: OrganizationProvisioning;
  active: boolean;
  createdBy: string;
};

export type UpdatePlatformOfferInput = {
  name?: string;
  description?: string;
  provisioning?: OrganizationProvisioning;
  active?: boolean;
};

export interface PlatformOfferRepository {
  list(includeInactive?: boolean): Promise<PlatformOffer[]>;
  findById(id: string): Promise<PlatformOffer | null>;
  create(input: CreatePlatformOfferInput): Promise<PlatformOffer>;
  update(id: string, input: UpdatePlatformOfferInput): Promise<PlatformOffer | null>;
  delete(id: string): Promise<boolean>;
}
