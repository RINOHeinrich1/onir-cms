/**
 * Constantes du contrat hôte des templates visuels.
 *
 * Le SDK est publié indépendamment du dashboard : ces valeurs sont volontairement
 * dupliquées depuis `src/domain/entities/visual-template.ts` et
 * `src/domain/template-contract.ts` (ADR-0024 §5.6, §12).
 */

/** Protocole hôte `onirtech.template-host.v1`. */
export const TEMPLATE_HOST_PROTOCOL = "onirtech.template-host.v1";

/** Version logique du contrat (transport-agnostique). */
export const CONTRACT_VERSION = 1;
