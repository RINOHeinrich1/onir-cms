export type BuilderReadinessInput = {
  missingRequirements: number;
  documentCount: number;
  attachedFileCount: number;
  pending: boolean;
  sourcePending: boolean;
  generating: boolean;
  hasGeneration: boolean;
};

/**
 * Le bouton de génération ne doit être actif que si le brief est complet et
 * que les documents annoncés sont réellement rattachés à la session.
 */
export function canGenerateChatbot(input: BuilderReadinessInput): boolean {
  const sourcesReady = input.documentCount === 0 || input.attachedFileCount > 0;
  return (
    input.missingRequirements === 0 &&
    sourcesReady &&
    !input.pending &&
    !input.sourcePending &&
    !input.generating &&
    !input.hasGeneration
  );
}
