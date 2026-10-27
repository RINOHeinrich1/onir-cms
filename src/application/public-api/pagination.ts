const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ApiCursor = {
  createdAt: string;
  id: string;
};

export type ApiSort = "asc" | "desc";

export type PageResult<T> = {
  data: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export function encodeApiCursor(cursor: ApiCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeApiCursor(value: string): ApiCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.createdAt))) return null;
    if (!UUID.test(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function compareValues(a: string, b: string): number {
  return a.localeCompare(b);
}

export function paginateByCreatedAt<T extends { id: string; createdAt: string }>(
  items: T[],
  limit: number,
  cursor: ApiCursor | null,
  sort: ApiSort,
): PageResult<T> {
  const sorted = [...items].sort((a, b) => {
    const createdAt = compareValues(a.createdAt, b.createdAt);
    const byDate = createdAt === 0 ? compareValues(a.id, b.id) : createdAt;
    return sort === "asc" ? byDate : -byDate;
  });

  const afterCursor =
    cursor === null
      ? sorted
      : sorted.filter((item) => {
          if (sort === "asc") {
            return (
              item.createdAt > cursor.createdAt ||
              (item.createdAt === cursor.createdAt && item.id > cursor.id)
            );
          }
          return (
            item.createdAt < cursor.createdAt ||
            (item.createdAt === cursor.createdAt && item.id < cursor.id)
          );
        });

  const page = afterCursor.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = afterCursor.length > limit;
  return {
    data: page,
    pagination: {
      limit,
      hasMore,
      nextCursor:
        hasMore && last !== undefined
          ? encodeApiCursor({
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
    },
  };
}
