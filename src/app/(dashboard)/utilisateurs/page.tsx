import { redirect } from "next/navigation";

export default function UsersRedirectPage() {
  redirect("/parametres-compte?tab=utilisateurs");
}
