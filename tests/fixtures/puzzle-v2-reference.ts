import type { TemplateEditorManifestV2 } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";

const text = (key: string): TemplateParamSchema => ({
  key,
  label: key,
  description: "",
  type: "string",
  default: "",
});

const number = (key: string): TemplateParamSchema => ({
  key,
  label: key,
  description: "",
  type: "number",
  default: 0,
});

function collection(key: string, fields: TemplateParamSchema[]): TemplateParamSchema {
  return {
    key,
    label: key,
    description: "",
    type: "array",
    default: [],
    minItems: 0,
    maxItems: 100,
    items: {
      type: "object",
      default: {},
      properties: [text("id"), ...fields],
    },
  };
}

const globalTheme: TemplateParamSchema = {
  key: "global_theme",
  label: "Thème global",
  description: "",
  type: "object",
  default: {},
  properties: [
    {
      key: "color_primary",
      label: "Couleur principale",
      description: "",
      type: "color",
      default: "#023777",
    },
    {
      key: "color_secondary",
      label: "Couleur secondaire",
      description: "",
      type: "color",
      default: "#f59e0b",
    },
    { key: "font_family", label: "Police", description: "", type: "string", default: "sans" },
    { key: "font_size", label: "Taille", description: "", type: "number", default: 16 },
    { key: "spacing", label: "Espacement", description: "", type: "number", default: 8 },
    { key: "radius", label: "Rayon", description: "", type: "number", default: 12 },
  ],
};

const siteSettings: TemplateParamSchema = {
  key: "site_settings",
  label: "Réglages du site",
  description: "",
  type: "object",
  default: {},
  properties: [
    {
      key: "chat_mode",
      label: "Mode du chat",
      description: "",
      type: "select",
      default: "embedded",
      options: [
        { value: "embedded", label: "Intégré" },
        { value: "floating", label: "Flottant" },
        { value: "off", label: "Désactivé" },
      ],
    },
    text("chat_page_id"),
  ],
};

export const puzzleV2Params: TemplateParamSchema[] = [
  collection("pages", [
    text("title"),
    text("slug"),
    text("header_id"),
    text("left_sidebar_id"),
    text("right_sidebar_id"),
    text("footer_id"),
  ]),
  collection("regions", [
    text("page_id"),
    text("slot"),
    { key: "shared", label: "Partagé", description: "", type: "boolean", default: false },
  ]),
  collection("blocks", [
    text("kind"),
    text("name"),
    text("title"),
    { key: "description", label: "Description", description: "", type: "text", default: "" },
    text("style_id"),
    text("action_id"),
  ]),
  collection("placements", [
    text("parent_id"),
    text("parent_kind"),
    text("child_id"),
    number("position"),
    text("slot"),
  ]),
  collection("actions", [text("kind"), text("target_id"), text("label")]),
  collection("style_profiles", [text("name"), number("font_size"), text("visibility")]),
  globalTheme,
  siteSettings,
];

export const puzzleV2Editor: TemplateEditorManifestV2 = {
  version: 2,
  regions: [
    { id: "header", label: "En-tête" },
    { id: "main", label: "Contenu principal" },
    { id: "footer", label: "Pied de page" },
  ],
  bindings: [
    { param: "global_theme", regions: ["header", "main", "footer"], category: "appearance" },
    { param: "site_settings", regions: ["main"], category: "content" },
    {
      param: "blocks",
      itemKey: "id",
      itemId: "hero_main",
      regions: ["block:hero_main"],
      category: "content",
    },
    {
      param: "blocks",
      itemKey: "id",
      itemId: "card_one",
      regions: ["block:card_one"],
      category: "content",
    },
    {
      param: "style_profiles",
      itemKey: "id",
      itemId: "profile_main",
      regions: ["style:profile_main"],
      category: "appearance",
    },
    {
      param: "actions",
      itemKey: "id",
      itemId: "action_scroll",
      regions: ["action:action_scroll"],
      category: "action",
    },
  ],
  collections: [
    {
      param: "pages",
      label: "Pages",
      itemKey: "id",
      itemLabel: "title",
      labelFallback: ["slug", "id"],
    },
    { param: "regions", label: "Régions", itemKey: "id", itemLabel: "slot", labelFallback: ["id"] },
    {
      param: "blocks",
      label: "Composants",
      itemKey: "id",
      itemLabel: "title",
      itemKind: "kind",
      labelFallback: ["name", "kind", "id"],
    },
    {
      param: "placements",
      label: "Placements",
      itemKey: "id",
      itemKind: "parent_kind",
      labelFallback: ["child_id", "id"],
    },
    {
      param: "actions",
      label: "Actions",
      itemKey: "id",
      itemLabel: "label",
      itemKind: "kind",
      labelFallback: ["id"],
    },
    {
      param: "style_profiles",
      label: "Styles",
      itemKey: "id",
      itemLabel: "name",
      labelFallback: ["id"],
    },
  ],
  dynamicRegions: [
    { idPattern: "page:{id}", collection: "pages", keyField: "id" },
    { idPattern: "block:{id}", collection: "blocks", keyField: "id" },
    { idPattern: "style:{id}", collection: "style_profiles", keyField: "id" },
    { idPattern: "action:{id}", collection: "actions", keyField: "id" },
  ],
  fields: [
    { param: "blocks", field: "description", visibleWhen: { field: "kind", equals: "hero" } },
    { param: "blocks", field: "action_id", visibleWhen: { field: "kind", in: ["button", "card"] } },
    {
      param: "site_settings",
      field: "chat_page_id",
      visibleWhen: { field: "chat_mode", equals: "embedded" },
    },
  ],
  groups: [
    {
      param: "global_theme",
      id: "colors",
      label: "Couleurs",
      fields: ["color_primary", "color_secondary"],
    },
    {
      param: "global_theme",
      id: "typography",
      label: "Typographie",
      fields: ["font_family", "font_size"],
    },
    { param: "global_theme", id: "spacing", label: "Espacements", fields: ["spacing"] },
    { param: "global_theme", id: "borders", label: "Bordures", fields: ["radius"] },
    { param: "site_settings", id: "chat", label: "Chat", fields: ["chat_mode", "chat_page_id"] },
    {
      param: "style_profiles",
      id: "advanced",
      label: "Avancé",
      collapsedByDefault: true,
      fields: ["font_size", "visibility"],
    },
  ],
  valueLabels: {
    global_theme: {
      font_family: { sans: "Sans-serif", serif: "Serif" },
    },
    site_settings: {
      chat_mode: { embedded: "Intégré", floating: "Flottant", off: "Désactivé" },
    },
    style_profiles: {
      visibility: { inherit: "Hériter du thème", visible: "Visible", hidden: "Masqué" },
    },
  },
  references: [
    {
      from: "regions",
      field: "page_id",
      to: "pages",
      targetKey: "id",
      optional: false,
      onDelete: "cascade",
    },
    {
      from: "pages",
      field: "header_id",
      to: "regions",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "pages",
      field: "left_sidebar_id",
      to: "regions",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "pages",
      field: "right_sidebar_id",
      to: "regions",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "pages",
      field: "footer_id",
      to: "regions",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "placements",
      field: "parent_id",
      targets: { page: "pages", region: "regions", block: "blocks" },
      discriminator: "parent_kind",
      targetKey: "id",
      optional: false,
      onDelete: "cascade",
    },
    {
      from: "placements",
      field: "child_id",
      to: "blocks",
      targetKey: "id",
      optional: false,
      onDelete: "cascade",
    },
    {
      from: "blocks",
      field: "style_id",
      to: "style_profiles",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "blocks",
      field: "action_id",
      to: "actions",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
    {
      from: "actions",
      field: "target_id",
      to: "blocks",
      targetKey: "id",
      optional: true,
      onDelete: "clear",
    },
  ],
  structure: {
    roots: "pages",
    regions: {
      collection: "regions",
      fields: ["header_id", "left_sidebar_id", "right_sidebar_id", "footer_id"],
    },
    children: {
      collection: "blocks",
      through: "placements",
      parentKey: "parent_id",
      parentKindKey: "parent_kind",
      childKey: "child_id",
      orderKey: "position",
      slotKey: "slot",
    },
  },
  scopes: [
    { param: "global_theme", scope: "global" },
    { param: "site_settings", scope: "global" },
    { param: "style_profiles", scope: "shared" },
    { param: "blocks", scope: "local" },
  ],
};

export const puzzleV2Values = {
  pages: [
    {
      id: "home",
      title: "Accueil",
      slug: "accueil",
      header_id: "header_home",
      left_sidebar_id: "",
      right_sidebar_id: "",
      footer_id: "footer_home",
    },
    {
      id: "about",
      title: "À propos",
      slug: "a-propos",
      header_id: "header_about",
      left_sidebar_id: "",
      right_sidebar_id: "",
      footer_id: "footer_about",
    },
  ],
  regions: [
    { id: "header_home", page_id: "home", slot: "header", shared: true },
    { id: "footer_home", page_id: "home", slot: "footer", shared: true },
    { id: "header_about", page_id: "about", slot: "header", shared: true },
    { id: "footer_about", page_id: "about", slot: "footer", shared: true },
  ],
  blocks: [
    {
      id: "hero_main",
      kind: "hero",
      name: "Hero",
      title: "Bienvenue",
      description: "Découvrez nos programmes.",
      style_id: "profile_main",
      action_id: "action_scroll",
    },
    {
      id: "card_one",
      kind: "card",
      name: "Carte 1",
      title: "Formation informatique",
      description: "",
      style_id: "profile_main",
      action_id: "action_scroll",
    },
    {
      id: "card_two",
      kind: "card",
      name: "Carte 2",
      title: "Formation professionnelle",
      description: "",
      style_id: "profile_main",
      action_id: "action_scroll",
    },
  ],
  placements: [
    {
      id: "placement_hero",
      parent_id: "home",
      parent_kind: "page",
      child_id: "hero_main",
      position: 0,
      slot: "main",
    },
    {
      id: "placement_cards",
      parent_id: "hero_main",
      parent_kind: "block",
      child_id: "card_one",
      position: 0,
      slot: "children",
    },
  ],
  actions: [
    { id: "action_scroll", kind: "scroll", target_id: "card_one", label: "Voir les formations" },
  ],
  style_profiles: [{ id: "profile_main", name: "Principal", font_size: 16, visibility: "inherit" }],
  global_theme: {
    color_primary: "#023777",
    color_secondary: "#f59e0b",
    font_family: "sans",
    font_size: 16,
    spacing: 8,
    radius: 12,
  },
  site_settings: { chat_mode: "embedded", chat_page_id: "home" },
} satisfies TemplateParamValues;
