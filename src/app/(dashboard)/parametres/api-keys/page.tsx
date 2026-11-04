import { redirect } from "next/navigation";

export default function ApiKeysRedirectPage() {
  redirect("/parametres-compte?tab=acces-api");
}
