import { NextResponse } from "next/server";
import {
  listCategoryAssignments,
  setCategoryAssignments,
} from "@/application/use-cases/categories/manage-categories";
import { pgCategoryRepository } from "@/infrastructure/db/category-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:list");
    const params = new URL(request.url).searchParams;
    const categories = await listCategoryAssignments(
      { categories: pgCategoryRepository(getPool()) },
      actor,
      params.get("contentType"),
      params.get("contentId"),
    );
    return NextResponse.json({ categories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:assign");
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const categories = await setCategoryAssignments(
      { categories: pgCategoryRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ categories });
  } catch (error) {
    return errorResponse(error);
  }
}
