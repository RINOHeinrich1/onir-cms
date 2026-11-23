import type {
  StandaloneBuildStatus,
  StandaloneDomainKind,
  StandaloneSslStatus,
  StandaloneVerificationStatus,
} from "@/domain/standalone";

export type StandaloneSettings = {
  chatLinkId: string;
  organizationId: string;
  enabled: boolean;
  activeBuildId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StandaloneBuild = {
  id: string;
  organizationId: string;
  chatLinkId: string;
  buildNumber: number;
  templateId: string | null;
  templateVersion: string | null;
  configHash: string;
  artifactKey: string | null;
  artifactSha256: string | null;
  status: StandaloneBuildStatus;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  activatedAt: string | null;
  supersededAt: string | null;
};

export type StandaloneDomain = {
  id: string;
  organizationId: string;
  chatLinkId: string;
  hostname: string;
  kind: StandaloneDomainKind;
  isPrimary: boolean;
  verificationToken: string | null;
  verificationStatus: StandaloneVerificationStatus;
  sslStatus: StandaloneSslStatus;
  lastCheckedAt: string | null;
  activatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateStandaloneBuildInput = {
  organizationId: string;
  chatLinkId: string;
  templateId: string | null;
  templateVersion: string | null;
  configHash: string;
  createdBy: string;
};

export type CreateStandaloneDomainInput = {
  organizationId: string;
  chatLinkId: string;
  hostname: string;
  kind: StandaloneDomainKind;
  verificationToken: string;
};

export type ActiveStandaloneMapping = {
  hostname: string;
  chatLinkId: string;
  organizationId: string;
  buildId: string;
  artifactKey: string;
  artifactSha256: string;
};

export interface StandaloneRepository {
  findSettings(chatLinkId: string): Promise<StandaloneSettings | null>;
  ensureSettings(input: {
    chatLinkId: string;
    organizationId: string;
  }): Promise<StandaloneSettings>;
  setEnabled(input: {
    chatLinkId: string;
    organizationId: string;
    enabled: boolean;
  }): Promise<StandaloneSettings>;

  createBuild(input: CreateStandaloneBuildInput): Promise<StandaloneBuild>;
  findBuild(id: string): Promise<StandaloneBuild | null>;
  listBuilds(chatLinkId: string): Promise<StandaloneBuild[]>;
  markBuildReady(input: {
    id: string;
    artifactKey: string;
    artifactSha256: string;
  }): Promise<StandaloneBuild>;
  markBuildFailed(input: { id: string; error: string }): Promise<StandaloneBuild>;
  activateBuild(input: {
    chatLinkId: string;
    buildId: string;
    organizationId: string;
  }): Promise<StandaloneBuild>;

  listDomains(chatLinkId: string): Promise<StandaloneDomain[]>;
  findDomain(id: string): Promise<StandaloneDomain | null>;
  findDomainByHostname(hostname: string): Promise<StandaloneDomain | null>;
  createDomain(input: CreateStandaloneDomainInput): Promise<StandaloneDomain>;
  setDomainVerification(input: {
    id: string;
    status: StandaloneVerificationStatus;
    lastError?: string | null;
  }): Promise<StandaloneDomain>;
  setDomainSsl(input: {
    id: string;
    status: StandaloneSslStatus;
    lastError?: string | null;
  }): Promise<StandaloneDomain>;
  setPrimaryDomain(input: { chatLinkId: string; domainId: string }): Promise<StandaloneDomain>;
  deleteDomain(id: string): Promise<void>;

  findActiveMappingByHostname(hostname: string): Promise<ActiveStandaloneMapping | null>;
}
