import { describe, expect, it } from "vitest";
import { decodeFicheCursor, encodeFicheCursor } from "@/lib/api-cursor";

describe("fiche cursor", () => {
  it("round-trips", () => {
    const cursor = {
      createdAt: "2026-10-26T09:00:00.000Z",
      id: "01553369-7fdb-4b4c-b681-f0b40628368e",
    };
    expect(decodeFicheCursor(encodeFicheCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors", () => {
    expect(decodeFicheCursor("not-base64")).toBeNull();
    expect(
      decodeFicheCursor(Buffer.from('{"createdAt":"x","id":"y"}').toString("base64url")),
    ).toBeNull();
  });
});
