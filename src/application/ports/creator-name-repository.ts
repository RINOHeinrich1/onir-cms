export type CreatorName = {
  id: string;
  name: string | null;
  email: string;
};

export interface CreatorNameRepository {
  listByIds(ids: readonly string[]): Promise<CreatorName[]>;
}
