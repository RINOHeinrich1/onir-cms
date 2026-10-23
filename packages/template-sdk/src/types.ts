/**
 * Types du contrat hôte des templates visuels (miroir distribué).
 *
 * Source de vérité côté hôte :
 * - `src/domain/template-contract.ts` (contexte, messages, actions) ;
 * - `src/domain/entities/visual-template.ts` (capacités, modes, niveaux de confiance) ;
 * - `src/domain/template-params.ts` (variables paramétrables, ADR-0023) ;
 * - `src/components/templates/TemplateHost.tsx` (actions et `on`).
 *
 * Le SDK étant publié indépendamment, la compatibilité structurelle est vérifiée
 * par un test d'assignabilité mutuelle côté dashboard (ADR-0024 §12).
 */

/** Capacités déclarables par un manifeste (ADR-0019, ADR-0020, ADR-0026). */
export type TemplateCapability =
  | "messages"
  | "media"
  | "modelForm"
  | "theme"
  | "userState"
  | "knowledge"
  | "data";

/** Mode du Shadow DOM (option de `defineTemplate`). */
export type ShadowDomMode = "open" | "closed" | "none";

/** Niveau de confiance d'un éditeur de template. */
export type TemplateTrustLevel = "official" | "verified" | "community";

/** Type d'un paramètre déclaré (ADR-0023). */
export type TemplateParamType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "color"
  | "url"
  | "select";

/** Valeur scalaire d'un paramètre. */
export type TemplateParamValue = string | number | boolean;

/** Sac de valeurs résolues (défauts ⊕ lien). */
export type TemplateParamValues = Record<string, TemplateParamValue>;

/** Option d'un paramètre `select`. */
export type TemplateParamOption = { value: string; label: string };

/** Schéma d'un paramètre déclaré par un manifeste (ADR-0023). */
export type TemplateParamSchema = {
  key: string;
  label: string;
  description: string;
  type: TemplateParamType;
  /** Toujours présent : aucun paramètre sans défaut. */
  default: TemplateParamValue;
  /** `string` / `text` uniquement. */
  maxLength?: number;
  /** `number` uniquement. */
  min?: number;
  max?: number;
  /** `select` uniquement. */
  options?: TemplateParamOption[];
};

/** Types du sous-ensemble JSON Schema accepté par les contrats (ADR-0026). */
export type JsonSchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean";
export type JsonSchemaFormat = "uri" | "date" | "date-time" | "email";
export type JsonSchemaValue = string | number | boolean;

/** Nœud de schéma déclaré par un contrat de données. */
export type JsonSchemaNode = {
  type: JsonSchemaType;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: JsonSchemaValue[];
  const?: JsonSchemaValue;
  format?: JsonSchemaFormat;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};

/** Type scalaire d'une entrée de contrat. */
export type DataInputType = "string" | "number" | "integer" | "boolean";

export type DataInputDeclaration = {
  key: string;
  type: DataInputType;
  required: boolean;
};

/** Contrat de données exposé par un template (bloc `data.contracts[]`). */
export type TemplateDataContract = {
  key: string;
  label: string;
  description: string;
  version: number;
  loading: "lazy" | "eager";
  inputs: DataInputDeclaration[];
  schema: JsonSchemaNode;
};

/** Codes d'erreur du chargement d'une ressource (ADR-0026 §6). */
export type DataErrorCode =
  | "DATA_UNBOUND"
  | "DATA_DISABLED"
  | "DATA_INPUT_INVALID"
  | "DATA_TIMEOUT"
  | "DATA_LIMIT"
  | "DATA_PROVIDER_ERROR"
  | "DATA_CONTRACT_INVALID"
  | "DATA_UNAUTHORIZED";

export type DataResult<T = unknown> =
  | {
      status: "ok";
      data: T;
      meta: { cached: boolean; generatedAt: string; revision: number; truncated: boolean };
    }
  | {
      status: "error";
      code: DataErrorCode;
      message: string;
      fieldErrors?: { path: string; message: string }[];
    };

/** Union fermée des états du visiteur (capacité `userState`, ADR-0020). */
export type TemplateUserState = "neutral" | "content" | "triste";

/** État du visiteur porté par un message utilisateur. */
export type TemplateMessageUserState = {
  label: TemplateUserState;
  confidence: number;
};

/** Média rattaché à un message. */
export type TemplateMessageMedia = {
  type: "photo" | "lien";
  libelle: string;
  url: string;
};

/** Référence légère d'une connaissance (capacité `knowledge`, ADR-0020). */
export type TemplateKnowledgeRef = {
  ref: string;
  titre: string;
};

/** Message de la discussion. */
export type TemplateMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  medias: TemplateMessageMedia[];
  at: string;
  /** Présent si la capacité `userState` ET le flag du lien sont actifs. */
  userState?: TemplateMessageUserState;
  /** Présent si la capacité `knowledge` ET la source sont actives. */
  knowledge?: TemplateKnowledgeRef[];
};

/** Média d'une galerie (ressource `media`). */
export type TemplateMediaItem = { id: string; libelle: string; url: string };

/** Champ du formulaire d'identité (ressource `modelForm`). */
export type TemplateFormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi" | "url" | "email";
  required: boolean;
  options?: string[];
};

/** État de la discussion. */
export type TemplateState = {
  phase: "identity" | "chat";
  status: "en_cours" | "finalisee";
  messages: TemplateMessage[];
  typing: boolean;
};

/** Identité soumise par le visiteur. */
export type TemplateIdentity = {
  nom: string;
  email: string;
  contacts?: { type: string; valeur: string }[];
  consentement?: boolean;
};

/** Action émise par le template vers l'hôte. */
export type TemplateAction =
  | { action: "ready" }
  | { action: "sendMessage"; payload: { content: string } }
  | { action: "submitIdentity"; payload: TemplateIdentity }
  | { action: "finish" }
  | { action: "request"; payload: { capability: TemplateCapability } }
  | { action: "openMedia"; payload: { url: string } }
  | { action: "resize"; payload: { height: number } };

/**
 * Partie sérialisable du contexte remise au template (sans actions).
 * Miroir de `TemplateContextPayload` côté hôte.
 */
export type TemplateContext = {
  host: { protocol: string; version: number };
  link: { type: "standard" | "specifique"; label: string; userStateEnabled: boolean };
  locale: string;
  brand: { name: string; logoUrl: string | null };
  theme: Record<string, string>;
  capabilities: TemplateCapability[];
  /** Valeurs résolues (défauts ⊕ lien), objet gelé (ADR-0023). */
  params: TemplateParamValues;
  /** Politique de confidentialité rattachée au lien (null si aucune). */
  consent: { texte: string; lien: string } | null;
  state: TemplateState;
  resources: {
    media: { photos: TemplateMediaItem[]; liens: TemplateMediaItem[] };
    modelForm: TemplateFormField[] | null;
    /** Instantanés des contrats `eager` (ADR-0026). */
    data?: Record<string, unknown>;
  };
};

/** Alias explicite côté hôte (`TemplateContextPayload`). */
export type TemplateContextPayload = TemplateContext;

/** Chargement des ressources de données déclarées (ADR-0026). */
export type TemplateDataApi = {
  load<T = unknown>(
    key: string,
    options?: { inputs?: Record<string, string | number | boolean> },
  ): Promise<DataResult<T>>;
};

/** Actions exécutées par l'hôte pour le compte du template. */
export type TemplateActions = {
  submitIdentity(data: TemplateIdentity): void;
  sendMessage(content: string): void;
  finish(): void;
  request(capability: TemplateCapability): Promise<unknown>;
  openMedia(url: string): void;
  resize(height: number): void;
};

/**
 * Contexte **live** remis à la fonction de rendu : payload + actions + abonnement.
 * Miroir de `LiveContext` côté `TemplateHost`.
 */
export type OnirtechContext = TemplateContext & {
  actions: TemplateActions;
  /** Requis pour les templates déclarant la capacité `data` (web-component). */
  data: TemplateDataApi;
  on(event: "state" | "resources" | "error", cb: (payload: unknown) => void): () => void;
};
