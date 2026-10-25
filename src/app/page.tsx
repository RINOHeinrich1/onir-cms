import { redirect } from "next/navigation";

/**
 * Le site public vit désormais sur cms.onirtech.com.
 * L’application est servie sur cms-backoffice.onirtech.com : la racine
 * renvoie vers le dashboard, puis vers la connexion si aucune session.
 */
export default function RootPage() {
  redirect("/dashboard");
}
