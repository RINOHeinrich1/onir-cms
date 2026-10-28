import { describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import type {
  ChatOperatorScope,
  ChatOperatorScopeRepository,
} from "@/application/ports/chat-operator-scope-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import { isRole, ROLE_LABELS, roleLabel } from "@/domain/entities/user";

const admin: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const operateur: Actor = {
  id: "op-1",
  role: "operateur",
  organizationId: "org-1",
  isSuperAdmin: false,
};

function scopes(scope: ChatOperatorScope | null): ChatOperatorScopeRepository {
  return {
    findForUser: async () => scope,
    setForUser: async (_organizationId, _userId, next) => next,
  };
}

describe("rôle operateur — identité et labels", () => {
  it("reconnaît le rôle et son libellé", () => {
    expect(isRole("operateur")).toBe(true);
    expect(roleLabel("operateur")).toBe("Opérateur chat");
    expect(ROLE_LABELS.operateur).toBe("Opérateur chat");
  });
});

describe("portée des conversations (ADR-0043)", () => {
  it("admin et rôles non opérateurs ne sont jamais filtrés", async () => {
    expect(await resolveConversationLinkScope(scopes(null), admin)).toBeNull();
    expect(
      await resolveConversationLinkScope(scopes(null), {
        ...admin,
        role: "marketeur",
      }),
    ).toBeNull();
    expect(
      await resolveConversationLinkScope(scopes(null), {
        ...admin,
        role: "lecteur",
      }),
    ).toBeNull();
  });

  it("opérateur sans restriction explicite voit tous les liens", async () => {
    expect(await resolveConversationLinkScope(scopes(null), operateur)).toBeNull();
    expect(
      await resolveConversationLinkScope(scopes({ allLinks: true, linkIds: [] }), operateur),
    ).toBeNull();
  });

  it("opérateur restreint est limité aux liens assignés", async () => {
    const result = await resolveConversationLinkScope(
      scopes({ allLinks: false, linkIds: ["l1", "l2"] }),
      operateur,
    );
    expect(result).toEqual(["l1", "l2"]);
  });

  it("opérateur restreint sans lien ne voit rien", async () => {
    const result = await resolveConversationLinkScope(
      scopes({ allLinks: false, linkIds: [] }),
      operateur,
    );
    expect(result).toEqual([]);
  });
});
