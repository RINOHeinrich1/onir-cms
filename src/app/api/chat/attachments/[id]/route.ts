import { NextResponse } from "next/server";
import { deletePendingAttachment } from "@/application/use-cases/attachments/manage-attachments";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { errorResponse } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE /api/chat/attachments/[id]?conversationId=… — retire une pièce en attente. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (conversationId === null || conversationId.trim() === "") {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const pool = getPool();
    await deletePendingAttachment(
      {
        organizations: pgOrganizationRepository(pool),
        attachments: pgAttachmentRepository(pool),
        storage: attachmentStorage(),
      },
      { conversationId: conversationId.trim(), attachmentId: id },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
