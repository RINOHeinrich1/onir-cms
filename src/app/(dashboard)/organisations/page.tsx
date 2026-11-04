import { redirect } from "next/navigation";

export default function OrganisationsRedirectPage() {
  redirect("/parametres-compte?tab=organisation");
}
