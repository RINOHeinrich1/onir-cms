import { env } from "@/lib/env";

export type RuntimeBanner = {
  enabled: boolean;
  message: string;
  detail: string;
};

export async function getRuntimeBanner(): Promise<RuntimeBanner | null> {
  if (env("BILLING_ENABLED") !== "true") return null;
  const baseUrl = env("COMMERCIAL_BACK_URL");
  if (baseUrl === undefined) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/runtime-banner`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<RuntimeBanner>;
    return {
      enabled: data.enabled === true,
      message: data.message ?? "",
      detail: data.detail ?? "",
    };
  } catch {
    return null;
  }
}
