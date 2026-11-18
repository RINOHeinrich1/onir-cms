import { afterEach, describe, expect, it, vi } from "vitest";
import { requirePlatformSuperAdmin } from "@/app/api/_lib/require-user";
import { UnauthorizedError } from "@/application/errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requirePlatformSuperAdmin", () => {
  it("accepte la clé plateforme et utilise le compte service configuré", async () => {
    vi.stubEnv("PLATFORM_API_KEY", "platform-secret");
    vi.stubEnv("PLATFORM_API_USER_ID", "4a86a7ff-96ce-4969-9f29-e62d231f7370");
    const actor = await requirePlatformSuperAdmin(
      new Request("http://localhost/api/platform/limit-profiles", {
        headers: { authorization: "Bearer platform-secret" },
      }),
    );
    expect(actor).toEqual({
      id: "4a86a7ff-96ce-4969-9f29-e62d231f7370",
      role: "admin",
      organizationId: null,
      isSuperAdmin: true,
    });
  });

  it("refuse une clé valide si le compte service n'est pas configuré", async () => {
    vi.stubEnv("PLATFORM_API_KEY", "platform-secret");
    vi.stubEnv("PLATFORM_API_USER_ID", "");
    await expect(
      requirePlatformSuperAdmin(
        new Request("http://localhost/api/platform/limit-profiles", {
          headers: { authorization: "Bearer platform-secret" },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
