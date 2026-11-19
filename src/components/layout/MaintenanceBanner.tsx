import Link from "next/link";
import { getRuntimeMaintenance } from "@/lib/runtime-maintenance";

function formatSchedule(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export async function MaintenanceBanner() {
  const maintenance = await getRuntimeMaintenance();
  if (maintenance === null || maintenance.status === "none" || maintenance.message === "") {
    return null;
  }

  const scheduled = formatSchedule(maintenance.scheduledAt);
  const inProgress = maintenance.status === "in_progress";

  return (
    <div
      className={`maintenance-banner maintenance-banner--${inProgress ? "progress" : "scheduled"}`}
      role="status"
    >
      <span className="maintenance-banner-dot" aria-hidden="true" />
      <div className="maintenance-banner-copy">
        <p>
          {maintenance.message}
          {!inProgress && scheduled ? <strong> · {scheduled}</strong> : null}
        </p>
        {maintenance.detail ? (
          <Link className="maintenance-banner-link" href="/maintenance">
            Détails
          </Link>
        ) : null}
      </div>
    </div>
  );
}
