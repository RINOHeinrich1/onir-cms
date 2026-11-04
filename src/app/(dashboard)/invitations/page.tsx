import { redirect } from "next/navigation";

export default function InvitationsRedirectPage() {
  redirect("/parametres-compte?tab=utilisateurs&sub=invitations");
}
