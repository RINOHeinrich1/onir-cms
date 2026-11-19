import { env } from "@/lib/env";

export type RuntimeMaintenance = {
  status: "none" | "scheduled" | "in_progress";
  scheduledAt: string;
  message: string;
  detail: string;
};

export async function getRuntimeMaintenance(): Promise<RuntimeMaintenance | null> {
  if (env("BILLING_ENABLED") !== "true") return null;
  const baseUrl = env("COMMERCIAL_BACK_URL");
  if (baseUrl === undefined) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/runtime-maintenance`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RuntimeMaintenance>;
    return {
      status: data.status === "scheduled" || data.status === "in_progress" ? data.status : "none",
      scheduledAt: data.scheduledAt ?? "",
      message: data.message ?? "",
      detail: data.detail ?? "",
    };
  } catch {
    return null;
  }
}
