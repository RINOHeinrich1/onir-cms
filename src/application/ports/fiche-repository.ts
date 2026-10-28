import type { Fiche, FicheArchiveFilter } from "@/domain/entities/fiche";

export type CreateFicheInput = {
  conversationId: string | null;
  prospectId: string | null;
  createdBy: string | null;
  templateKey: string;
  templateVersion: number;
  /** Valeurs génériques (clés = field.name du modèle). */
  data: Record<string, unknown>;
};

export interface FicheRepository {
  findById(organizationId: string, id: string): Promise<Fiche | null>;
  /** Fiches rattachées à une conversation (plusieurs possibles). */
  listByConversation(organizationId: string, conversationId: string): Promise<Fiche[]>;
  /** Liste filtrée par archivage et, optionnellement, par libellé de lien. */
  list(
    organizationId: string,
    filter: FicheArchiveFilter,
    linkLabel?: string | string[] | null,
  ): Promise<Fiche[]>;
  create(organizationId: string, input: CreateFicheInput): Promise<Fiche>;
  /** Archive / désarchive une fiche ; null si introuvable. */
  setArchivee(organizationId: string, id: string, archivee: boolean): Promise<Fiche | null>;
}
