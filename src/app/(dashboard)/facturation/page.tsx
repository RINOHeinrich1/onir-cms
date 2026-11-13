import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BILLING_API_URL, BILLING_ENABLED, BILLING_PORTAL_URL } from "@/config/billing";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Facturation",
};

function BillingUnavailable() {
  return (
    <section className="card" style={{ maxWidth: "42rem", margin: "2rem auto" }}>
      <h1>Facturation indisponible</h1>
      <p className="muted-text">
        Le service de facturation ne répond pas pour le moment. Votre compte et vos données restent
        accessibles.
      </p>
      <p className="muted-text">
        Contactez le support ONIR-CMS :{" "}
        <a href="mailto:contact@onir-cms.tech">contact@onir-cms.tech</a>
        {" · "}
        <a href="https://wa.me/261349368233" rel="noreferrer" target="_blank">
          WhatsApp +261 34 93 682 33
        </a>
      </p>
    </section>
  );
}

export default async function FacturationPage() {
  if (!BILLING_ENABLED) notFound();

  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (context.actor.isSuperAdmin || context.role !== "admin") notFound();
  if (context.actor.organizationId === null) notFound();

  const apiKey = env("COMMERCIAL_BILLING_API_KEY");
  if (apiKey === undefined || BILLING_API_URL === "" || BILLING_PORTAL_URL === "") {
    return <BillingUnavailable />;
  }

  let response: Response;
  try {
    response = await fetch(`${BILLING_API_URL.replace(/\/+$/, "")}/api/platform/billing/handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        onirOrganizationId: context.actor.organizationId,
        userId: context.user.id,
        email: context.user.email,
        organizationName: context.organization?.name ?? null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return <BillingUnavailable />;
  }

  if (!response.ok) return <BillingUnavailable />;
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== "string" || body.code === "") return <BillingUnavailable />;

  const handoff = new URL(`${BILLING_API_URL.replace(/\/+$/, "")}/api/espace-client/handoff`);
  handoff.searchParams.set("code", body.code);
  redirect(handoff.toString());
}
