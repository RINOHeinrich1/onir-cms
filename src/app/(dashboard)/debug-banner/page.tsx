import Link from "next/link";
import { notFound } from "next/navigation";
import { getRuntimeBanner } from "@/lib/runtime-banner";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Détail de l’intervention",
};

export default async function DebugBannerDetailPage() {
  const banner = await getRuntimeBanner();
  if (banner === null || !banner.enabled || banner.detail === "") notFound();

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Information</p>
          <h1>Détail de l’intervention</h1>
        </div>
        <Link className="btn btn-ghost" href="/dashboard">
          Retour au dashboard
        </Link>
      </div>
      <section className="card">
        <h2>{banner.message}</h2>
        <p className="debug-detail-text">{banner.detail}</p>
      </section>
    </div>
  );
}
