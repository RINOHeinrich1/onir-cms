import { describe, expect, it } from "vitest";
import { TemplateQueryError } from "@/application/ports/template-query-executor";
import {
  assertReadOnlyQuery,
  TEMPLATE_QUERY_LIMITS,
} from "@/infrastructure/db/template-query-executor";

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof TemplateQueryError ? error.code : "NOT_TEMPLATE_ERROR";
  }
}

describe("assertReadOnlyQuery", () => {
  it("accepte SELECT et WITH", () => {
    expect(() => assertReadOnlyQuery("SELECT 1")).not.toThrow();
    expect(() => assertReadOnlyQuery("  select * from template_read.v_medias")).not.toThrow();
    expect(() => assertReadOnlyQuery("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow();
  });

  it("refuse toute autre instruction", () => {
    for (const sql of [
      "UPDATE template_read.v_medias SET libelle = 'x'",
      "DELETE FROM template_read.v_medias",
      "INSERT INTO template_read.v_medias VALUES (1)",
      "DROP TABLE medias",
      "CREATE TABLE x (id int)",
    ]) {
      expect(codeOf(() => assertReadOnlyQuery(sql))).toBe("DATA_PROVIDER_ERROR");
    }
  });

  it("refuse plusieurs instructions, commentaires et octets nuls", () => {
    expect(codeOf(() => assertReadOnlyQuery("SELECT 1; DROP TABLE medias"))).toBe(
      "DATA_PROVIDER_ERROR",
    );
    expect(codeOf(() => assertReadOnlyQuery("SELECT 1 -- commentaire"))).toBe(
      "DATA_PROVIDER_ERROR",
    );
    expect(codeOf(() => assertReadOnlyQuery("SELECT 1 /* x */"))).toBe("DATA_PROVIDER_ERROR");
    expect(codeOf(() => assertReadOnlyQuery("SELECT 1\u0000"))).toBe("DATA_PROVIDER_ERROR");
  });

  it("refuse une requête vide ou trop longue", () => {
    expect(codeOf(() => assertReadOnlyQuery("   "))).toBe("DATA_PROVIDER_ERROR");
    const long = `SELECT '${"x".repeat(TEMPLATE_QUERY_LIMITS.maxSqlBytes)}'`;
    expect(codeOf(() => assertReadOnlyQuery(long))).toBe("DATA_PROVIDER_ERROR");
  });
});
