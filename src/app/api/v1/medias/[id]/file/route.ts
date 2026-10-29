import { NotFoundError } from "@/application/errors";
import { mediaWriteDeps } from "../../../_lib/deps";
import { withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

/** GET /api/v1/medias/[id]/file — fichier photo authentifié par clé API. */
export const GET = withApiKey("medias:read", async ({ principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const deps = mediaWriteDeps();
  const media = await deps.medias.findById(principal.organizationId, id);
  if (media === null || media.type !== "photo" || media.fichier === null) {
    throw new NotFoundError("Média introuvable");
  }
  const file = await deps.storage.read(media.fichier);
  if (file === null) throw new NotFoundError("Fichier introuvable");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType || media.mime || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
