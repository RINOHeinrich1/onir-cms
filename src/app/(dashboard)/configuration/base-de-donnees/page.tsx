import { redirect } from "next/navigation";

export default function DatabaseSettingsRedirectPage() {
  redirect("/configuration?tab=database");
}
