export type StorageQuotaRepository = {
  assertCanStore(organizationId: string, incomingBytes: number): Promise<void>;
};
