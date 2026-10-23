import { NextResponse } from "next/server";
import {
  createCategory,
  listCategories,
} from "@/application/use-cases/categories/manage-categories";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgCategoryRepository } from "@/infrastructure/db/category-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:list");
    const pool = getPool();
    const categories = await listCategories({ categories: pgCategoryRepository(pool) }, actor);
    return NextResponse.json({
      categories: await attachCreatorLabels(categories, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:create");
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const category = await createCategory(
      { categories: pgCategoryRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
