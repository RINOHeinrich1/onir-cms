import { ficheDto } from "@/application/public-api/dto";
import { getFicheForOrganization } from "@/application/use-cases/fiches/get-fiche";
import { ficheDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("fiches:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const fiche = await getFicheForOrganization(ficheDeps(), principal.organizationId, id);
  return apiJson({ data: ficheDto(fiche) }, requestId);
});
