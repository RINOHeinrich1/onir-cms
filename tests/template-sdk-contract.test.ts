/**
 * Anti-dérive du contrat hôte ↔ SDK (ADR-0024 §12).
 *
 * Le SDK `@onirtech/template-sdk` est publié indépendamment : il duplique les
 * types du contrat hôte (`src/domain/template-contract.ts`,
 * `src/domain/entities/visual-template.ts`, `src/domain/template-params.ts`).
 * Ce test verrouille l'**assignabilité mutuelle** des deux définitions :
 * toute divergence fait échouer `npm run typecheck` **avant** `npm test`.
 *
 * Le type SDK complet `OnirtechContext` (payload + actions + abonnement) n'est
 * volontairement pas comparé : la contrainte porte sur la partie sérialisable
 * (`TemplateContext` côté SDK, miroir de `TemplateContextPayload` côté hôte).
 */
import { describe, expect, it } from "vitest";
import type { TemplateDataContract as HostTemplateDataContract } from "@/domain/data-contracts";
import {
  type TemplateCapability as HostTemplateCapability,
  type TemplateShadowDom as HostTemplateShadowDom,
  type TemplateTrustLevel as HostTemplateTrustLevel,
  TEMPLATE_CAPABILITIES,
  TEMPLATE_HOST_PROTOCOL,
  TEMPLATE_SHADOW_DOMS,
  TEMPLATE_TRUST_LEVELS,
} from "@/domain/entities/visual-template";
import {
  type TemplateAction as HostTemplateAction,
  type TemplateContextPayload as HostTemplateContextPayload,
  type TemplateIdentity as HostTemplateIdentity,
  type TemplateMessage as HostTemplateMessage,
  TEMPLATE_CONTRACT_VERSION,
} from "@/domain/template-contract";
import {
  type TemplateParamType as HostTemplateParamType,
  TEMPLATE_PARAM_TYPES,
} from "@/domain/template-params";
import {
  CONTRACT_VERSION as SDK_CONTRACT_VERSION,
  TEMPLATE_HOST_PROTOCOL as SDK_TEMPLATE_HOST_PROTOCOL,
} from "../packages/template-sdk/src/constants";
import type {
  ShadowDomMode as SdkShadowDomMode,
  TemplateAction as SdkTemplateAction,
  TemplateCapability as SdkTemplateCapability,
  TemplateContext as SdkTemplateContext,
  TemplateDataContract as SdkTemplateDataContract,
  TemplateIdentity as SdkTemplateIdentity,
  TemplateMessage as SdkTemplateMessage,
  TemplateParamType as SdkTemplateParamType,
  TemplateTrustLevel as SdkTemplateTrustLevel,
} from "../packages/template-sdk/src/types";

/** `true` si `A` est assignable à `B` (non distributif : unions comparées entières). */
type Extends<A, B> = [A] extends [B] ? true : false;

/** Contrainte d'assertion : le type doit valoir exactement `true`. */
type Expect<T extends true> = T;

// — Contexte sérialisable : SDK `TemplateContext` ↔ hôte `TemplateContextPayload` —
type ContextSdkToHost = Expect<Extends<SdkTemplateContext, HostTemplateContextPayload>>;
type ContextHostToSdk = Expect<Extends<HostTemplateContextPayload, SdkTemplateContext>>;

// — Messages (y compris `userState` et `knowledge`) —
type MessageSdkToHost = Expect<Extends<SdkTemplateMessage, HostTemplateMessage>>;
type MessageHostToSdk = Expect<Extends<HostTemplateMessage, SdkTemplateMessage>>;

// — Actions émises par le template (union discriminée) —
type ActionSdkToHost = Expect<Extends<SdkTemplateAction, HostTemplateAction>>;
type ActionHostToSdk = Expect<Extends<HostTemplateAction, SdkTemplateAction>>;

// — Identité soumise par le visiteur (payload de `submitIdentity`) —
type IdentitySdkToHost = Expect<Extends<SdkTemplateIdentity, HostTemplateIdentity>>;
type IdentityHostToSdk = Expect<Extends<HostTemplateIdentity, SdkTemplateIdentity>>;

// — Unions et constantes du domaine —
type CapabilitySdkToHost = Expect<Extends<SdkTemplateCapability, HostTemplateCapability>>;
type CapabilityHostToSdk = Expect<Extends<HostTemplateCapability, SdkTemplateCapability>>;
type ParamTypeSdkToHost = Expect<Extends<SdkTemplateParamType, HostTemplateParamType>>;
type ParamTypeHostToSdk = Expect<Extends<HostTemplateParamType, SdkTemplateParamType>>;
type TrustLevelSdkToHost = Expect<Extends<SdkTemplateTrustLevel, HostTemplateTrustLevel>>;
type TrustLevelHostToSdk = Expect<Extends<HostTemplateTrustLevel, SdkTemplateTrustLevel>>;
type ShadowDomSdkToHost = Expect<Extends<SdkShadowDomMode, HostTemplateShadowDom>>;
type ShadowDomHostToSdk = Expect<Extends<HostTemplateShadowDom, SdkShadowDomMode>>;
const dataContractSdkToHost = (value: SdkTemplateDataContract): HostTemplateDataContract => value;
const dataContractHostToSdk = (value: HostTemplateDataContract): SdkTemplateDataContract => value;

// — Constantes littérales : le SDK doit porter EXACTEMENT la valeur de l'hôte —
type ProtocolSdkToHost = Expect<
  Extends<typeof SDK_TEMPLATE_HOST_PROTOCOL, typeof TEMPLATE_HOST_PROTOCOL>
>;
type ProtocolHostToSdk = Expect<
  Extends<typeof TEMPLATE_HOST_PROTOCOL, typeof SDK_TEMPLATE_HOST_PROTOCOL>
>;
type VersionSdkToHost = Expect<
  Extends<typeof SDK_CONTRACT_VERSION, typeof TEMPLATE_CONTRACT_VERSION>
>;
type VersionHostToSdk = Expect<
  Extends<typeof TEMPLATE_CONTRACT_VERSION, typeof SDK_CONTRACT_VERSION>
>;

/**
 * Consommé par le test : force l'évaluation des assertions de types (une
 * divergence casse la compilation, donc `npm run typecheck`).
 */
const TYPE_ASSERTIONS = [
  true satisfies ContextSdkToHost,
  true satisfies ContextHostToSdk,
  true satisfies MessageSdkToHost,
  true satisfies MessageHostToSdk,
  true satisfies ActionSdkToHost,
  true satisfies ActionHostToSdk,
  true satisfies IdentitySdkToHost,
  true satisfies IdentityHostToSdk,
  true satisfies CapabilitySdkToHost,
  true satisfies CapabilityHostToSdk,
  true satisfies ParamTypeSdkToHost,
  true satisfies ParamTypeHostToSdk,
  true satisfies TrustLevelSdkToHost,
  true satisfies TrustLevelHostToSdk,
  true satisfies ShadowDomSdkToHost,
  true satisfies ShadowDomHostToSdk,
  true satisfies ProtocolSdkToHost,
  true satisfies ProtocolHostToSdk,
  true satisfies VersionSdkToHost,
  true satisfies VersionHostToSdk,
] as const;

describe("contrat hôte ↔ SDK (ADR-0024 §12)", () => {
  it("les types du SDK sont mutuellement assignables avec le contrat hôte", () => {
    expect(TYPE_ASSERTIONS.every((assertion) => assertion)).toBe(true);
  });

  it("le protocole hôte est identique dans le SDK et le cœur", () => {
    expect(SDK_TEMPLATE_HOST_PROTOCOL).toBe(TEMPLATE_HOST_PROTOCOL);
    expect(SDK_TEMPLATE_HOST_PROTOCOL).toBe("onirtech.template-host.v1");
  });

  it("la version du contrat est identique dans le SDK et le cœur", () => {
    expect(SDK_CONTRACT_VERSION).toBe(TEMPLATE_CONTRACT_VERSION);
    expect(SDK_CONTRACT_VERSION).toBe(1);
  });

  it("les listes de valeurs exposées par le cœur sont non vides (garde-fou de lecture)", () => {
    expect(TEMPLATE_CAPABILITIES.length).toBeGreaterThan(0);
    expect(TEMPLATE_PARAM_TYPES.length).toBeGreaterThan(0);
    expect(TEMPLATE_TRUST_LEVELS.length).toBeGreaterThan(0);
    expect(TEMPLATE_SHADOW_DOMS.length).toBeGreaterThan(0);
  });
});

describe("ressources de données — assignabilité hôte ↔ SDK", () => {
  it("accepte les deux directions", () => {
    expect(typeof dataContractSdkToHost).toBe("function");
    expect(typeof dataContractHostToSdk).toBe("function");
  });
});
