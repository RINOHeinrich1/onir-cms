import { NextResponse } from "next/server";
import {
  deleteCategory,
  updateCategory,
} from "@/application/use-cases/categories/manage-categories";
import { pgCategoryRepository } from "@/infrastructure/db/category-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const category = await updateCategory(
      { categories: pgCategoryRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ category });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "categories:delete");
    const { id } = await context.params;
    await deleteCategory({ categories: pgCategoryRepository(getPool()) }, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
