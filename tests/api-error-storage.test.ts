import { describe, expect, it } from "vitest";
import { errorResponse } from "@/app/api/_lib/errors";
import { StorageUnavailableError } from "@/application/errors";

describe("erreurs API de stockage", () => {
  it("retourne un 503 explicite au lieu d'une erreur interne", async () => {
    const response = errorResponse(new StorageUnavailableError(undefined, new Error("no space")));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "Stockage des fichiers indisponible : espace insuffisant ou service de stockage en erreur. Réessayez après libération de l’espace.",
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
