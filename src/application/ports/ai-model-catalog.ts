export type AiCatalogTarget = {
  baseUrl: string;
  apiKey: string;
  /** Identifiant local utilisé comme clé de cache (jamais la clé API). */
  cacheKey?: string;
};

export type AiModelCatalogResult = {
  models: string[];
  modelsAvailable: boolean;
  latencyMs: number;
};

export type AiConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  modelsCount: number;
  modelsAvailable: boolean;
  error: string;
};

/** Port du catalogue `/models` d'un fournisseur OpenAI-compatible. */
export interface AiModelCatalog {
  listModels(target: AiCatalogTarget): Promise<AiModelCatalogResult>;
  testConnection(target: AiCatalogTarget): Promise<AiConnectionTestResult>;
}
