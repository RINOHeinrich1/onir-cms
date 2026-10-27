import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROOT = join(process.cwd(), "node_modules", "swagger-ui-dist");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".html": "text/html; charset=utf-8",
};

type RouteContext = { params: Promise<{ asset: string[] }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { asset } = await context.params;
  const target = resolve(ROOT, ...(asset ?? []));
  if (!target.startsWith(`${ROOT}${sep}`)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const file = await readFile(target);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
