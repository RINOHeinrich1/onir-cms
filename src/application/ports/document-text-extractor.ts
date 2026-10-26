/** Port d'extraction de texte d'un document fourni à l'assistance IA (ADR-0038). */

export type DocumentInput = {
  name: string;
  mime: string;
  bytes: Uint8Array;
};

export type ExtractedDocument = {
  name: string;
  mime: string;
  text: string;
  chars: number;
  truncated: boolean;
  warnings: string[];
};

export interface DocumentTextExtractor {
  /** Extrait le texte ; lève une erreur applicative si le format est invalide. */
  extract(input: DocumentInput): Promise<ExtractedDocument>;
}
