import { describe, expect, it } from "vitest";
import {
  autoMapContractFields,
  generateChildQuery,
  generateTemplateQuery,
  guessForeignKey,
  orderForeignKeyColumns,
  scalarFieldNames,
  sqlLiteral,
} from "@/lib/data-query-composer";

describe("composition assistée des requêtes", () => {
  const columns = [
    { name: "id" },
    { name: "titre" },
    { name: "auteur" },
    { name: "contenu" },
    { name: "created_at" },
  ];

  it("mappe exactement puis par proximité, sans réutiliser une colonne", () => {
    expect(autoMapContractFields(["id", "title", "author", "content"], columns)).toEqual({
      id: "id",
      title: "titre",
      author: "auteur",
      content: "contenu",
    });
  });

  it("ne mappe pas un champ trop éloigné", () => {
    const mapping = autoMapContractFields(["cover_url"], columns);
    expect(mapping.cover_url).toBeUndefined();
  });

  it("génère les alias, filtres, tri et limite", () => {
    const sql = generateTemplateQuery({
      view: "v_connaissances",
      fields: ["id", "title", "author"],
      mapping: { id: "id", title: "titre", author: "auteur" },
      filters: [
        { column: "contenu", operator: "ILIKE", value: "%tarif%" },
        { column: "auteur", operator: "IS NOT NULL", value: "" },
      ],
      orderBy: "titre",
      orderDirection: "asc",
      limit: 25,
    });
    expect(sql).toBe(
      "SELECT id, titre AS title, auteur AS author FROM v_connaissances " +
        "WHERE contenu ILIKE '%tarif%' AND auteur IS NOT NULL ORDER BY titre ASC LIMIT 25",
    );
  });

  it("ignore les champs non mappés et borne la limite", () => {
    const sql = generateTemplateQuery({
      view: "v_medias",
      fields: ["url", "missing"],
      mapping: { url: "url" },
      filters: [],
      orderBy: "",
      orderDirection: "desc",
      limit: 99999,
    });
    expect(sql).toBe("SELECT url FROM v_medias LIMIT 1000");
  });

  it("échappe les littéraux et les identifiants", () => {
    expect(sqlLiteral("L'offre")).toBe("'L''offre'");
    expect(sqlLiteral("42")).toBe("42");
    const sql = generateTemplateQuery({
      view: "v_medias",
      fields: ["weird-field"],
      mapping: { "weird-field": "libelle" },
      filters: [{ column: "libelle", operator: "=", value: "L'offre" }],
      orderBy: "libelle",
      orderDirection: "asc",
      limit: 5,
    });
    expect(sql).toBe(
      "SELECT libelle AS \"weird-field\" FROM v_medias WHERE libelle = 'L''offre' ORDER BY libelle ASC LIMIT 5",
    );
  });
});

describe("composition des collections liées", () => {
  it("devine la clé de rattachement", () => {
    expect(guessForeignKey("pages", [{ name: "id" }, { name: "page_id" }])).toBe("page_id");
    expect(guessForeignKey("media", [{ name: "id" }, { name: "media_id" }])).toBe("media_id");
    expect(guessForeignKey("pages", [{ name: "id" }])).toBe("");
  });

  it("génère la requête enfant avec la clé, les alias et le tri", () => {
    const sql = generateChildQuery({
      view: "v_pages",
      foreignKey: "book_id",
      fields: ["index", "text"],
      mapping: { index: "position", text: "contenu" },
      orderBy: "position",
      orderDirection: "asc",
    });
    expect(sql).toBe(
      "SELECT book_id, position AS index, contenu AS text FROM v_pages " +
        "WHERE book_id = ANY($1) ORDER BY position ASC",
    );
  });

  it("applique les filtres de la collection liée", () => {
    const sql = generateChildQuery({
      view: "v_media_categories",
      foreignKey: "category_id",
      fields: ["text", "image", "index"],
      mapping: { text: "media_libelle", image: "media_url", index: "media_id" },
      filters: [
        { column: "media_url", operator: "IS NOT NULL", value: "" },
        { column: "media_type", operator: "=", value: "lien" },
      ],
      orderBy: "media_libelle",
      orderDirection: "asc",
    });
    expect(sql).toContain("WHERE category_id = ANY($1)");
    expect(sql).toContain("AND media_url IS NOT NULL");
    expect(sql).toContain("AND media_type = 'lien'");
  });

  it("omet la requête enfant sans clé de rattachement", () => {
    expect(
      generateChildQuery({
        view: "v_pages",
        foreignKey: "",
        fields: ["text"],
        mapping: { text: "contenu" },
        orderBy: "",
        orderDirection: "asc",
      }),
    ).toBe("");
  });
});

describe("champs scalaires du contrat", () => {
  it("exclut les collections liées de la table principale", () => {
    expect(
      scalarFieldNames({
        id: { type: "string" },
        title: { type: "string" },
        pages: { type: "array" },
      }),
    ).toEqual(["id", "title"]);
  });
});

describe("priorité des clés de rattachement", () => {
  const columns = [
    { name: "id" },
    { name: "category_id" },
    { name: "media_id" },
    { name: "label" },
  ];

  it("devine la clé parent et priorise category_id", () => {
    expect(guessForeignKey("categories", columns, "medias")).toBe("media_id");
    expect(guessForeignKey("medias", columns, "categories")).toBe("category_id");
    expect(orderForeignKeyColumns(columns, "categories", "medias").map((c) => c.name)).toEqual([
      "media_id",
      "category_id",
      "id",
      "label",
    ]);
  });
});
