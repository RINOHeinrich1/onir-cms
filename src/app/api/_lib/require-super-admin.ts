import { ForbiddenError } from "@/application/errors";
import { type RequestSession, requireUser } from "./require-user";

/** Garde HTTP : réservé au super-administrateur (administration plateforme). */
export async function requireSuperAdmin(request: Request): Promise<RequestSession> {
  const session = await requireUser(request);
  if (!session.actor.isSuperAdmin) {
    throw new ForbiddenError("Réservé au super-administrateur");
  }
  return session;
}
