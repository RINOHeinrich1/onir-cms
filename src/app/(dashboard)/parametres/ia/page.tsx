import { redirect } from "next/navigation";

export default function AiSettingsRedirectPage() {
  redirect("/configuration?tab=ia");
}
