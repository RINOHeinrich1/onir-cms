import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ filtre?: string; lien?: string; onglet?: string }>;
};

/** Ancienne URL : redirection vers Leads en conservant les filtres. */
export default async function FichesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/leads${suffix === "" ? "" : `?${suffix}`}`);
}
