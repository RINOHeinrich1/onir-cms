import Link from "next/link";
import { notFound } from "next/navigation";
import { getRuntimeMaintenance } from "@/lib/runtime-maintenance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Maintenance",
};

function formatSchedule(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default async function MaintenancePage() {
  const maintenance = await getRuntimeMaintenance();
  if (maintenance === null || maintenance.status === "none" || maintenance.message === "") {
    notFound();
  }

  const scheduled = formatSchedule(maintenance.scheduledAt);

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="eyebrow">Information</p>
          <h1>Maintenance</h1>
        </div>
        <Link className="btn btn-ghost" href="/dashboard">
          Retour au dashboard
        </Link>
      </div>
      <section
        className={`card maintenance-detail-card maintenance-detail-card--${maintenance.status === "in_progress" ? "progress" : "scheduled"}`}
      >
        <p className="eyebrow">
          {maintenance.status === "in_progress" ? "Maintenance en cours" : "Maintenance planifiée"}
        </p>
        <h2>{maintenance.message}</h2>
        {scheduled ? <p className="maintenance-detail-date">{scheduled}</p> : null}
        {maintenance.detail ? (
          <p className="maintenance-detail-text">{maintenance.detail}</p>
        ) : null}
      </section>
    </div>
  );
}
