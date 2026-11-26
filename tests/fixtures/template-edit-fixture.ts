import type { TemplateEditorManifestV2 } from "@/domain/template-editor";
import type { TemplateParamValues } from "@/domain/template-params";

export const templateEditEditor: TemplateEditorManifestV2 = {
  version: 2,
  regions: [{ id: "main", label: "Principal" }],
  bindings: [{ param: "blocks", regions: ["block:{id}"], category: "content" }],
  collections: [
    {
      param: "pages",
      label: "Pages",
      itemKey: "id",
      itemLabel: "title",
      labelFallback: ["slug", "id"],
    },
    {
      param: "regions",
      label: "Zones",
      itemKey: "id",
      itemLabel: "name",
      itemKind: "kind",
      labelFallback: ["id"],
    },
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
      itemLabel: "child_id",
      itemKind: "parent_kind",
      labelFallback: ["id"],
    },
  ],
  dynamicRegions: [{ idPattern: "block:{id}", collection: "blocks", keyField: "id" }],
  structure: {
    roots: "pages",
    regions: {
      collection: "regions",
      fields: ["header_id", "footer_id"],
    },
    children: {
      collection: "blocks",
      through: "placements",
      parentKey: "parent_id",
      parentKindKey: "parent_kind",
      childKey: "child_id",
      slotKey: "slot",
    },
  },
};

export const templateEditValues: TemplateParamValues = {
  pages: [
    {
      id: "home",
      slug: "accueil",
      title: "Accueil",
      header_id: "header_main",
    },
    {
      id: "about",
      slug: "a-propos",
      title: "À propos",
      header_id: "header_main",
    },
  ],
  regions: [{ id: "header_main", name: "En-tête", kind: "header" }],
  blocks: [
    {
      id: "hero_main",
      kind: "hero",
      title: "À vous d’assembler la suite.",
      text: "Un site qui prend la forme de vos idées.",
    },
    {
      id: "hero_button",
      kind: "button",
      title: "Parler à notre assistant",
      text: "",
    },
    {
      id: "theme_btn",
      kind: "button",
      title: "Thème",
      text: "",
    },
    {
      id: "about_text",
      kind: "text",
      title: "À propos de Puzzle",
      text: "Nous racontons l’histoire du produit.",
    },
    {
      id: "services",
      kind: "grid",
      title: "Services",
      text: "",
    },
  ],
  placements: [
    {
      id: "p1",
      parent_kind: "page",
      parent_id: "home",
      child_id: "hero_main",
      slot: "main",
      position: 0,
    },
    {
      id: "p2",
      parent_kind: "block",
      parent_id: "hero_main",
      child_id: "hero_button",
      slot: "actions",
      position: 0,
    },
    {
      id: "p3",
      parent_kind: "page",
      parent_id: "home",
      child_id: "services",
      slot: "main",
      position: 1,
    },
    {
      id: "p4",
      parent_kind: "page",
      parent_id: "about",
      child_id: "about_text",
      slot: "main",
      position: 0,
    },
    {
      id: "p5",
      parent_kind: "region",
      parent_id: "header_main",
      child_id: "theme_btn",
      slot: "end",
      position: 0,
    },
  ],
};
