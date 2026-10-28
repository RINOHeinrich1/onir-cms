import type { Metadata } from "next";
import type { ReactNode } from "react";
import { resolveInvitation } from "@/application/use-cases/invitations/resolve-invitation";
import { AcceptInvitationForm } from "@/components/invitations/AcceptInvitationForm";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ROLE_LABELS } from "@/domain/entities/user";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

function ExpiredCard({ title, message }: { title: string; message: string }) {
  return (
    <section className="auth-card">
      <span className="eyebrow">Invitation</span>
      <h1>{title}</h1>
      <p className="hint">{message}</p>
    </section>
  );
}

/** Page publique d'acceptation d'une invitation (lien à usage unique). */
export default async function InvitationPage({ params }: PageProps) {
  const { token } = await params;
  const invitation = await resolveInvitation(
    { invitations: pgInvitationRepository(getPool()) },
    token,
  );

  let content: ReactNode;
  if (invitation === null) {
    content = (
      <ExpiredCard
        title="Invitation invalide"
        message="Ce lien n'existe pas ou a été supprimé. Demandez une nouvelle invitation."
      />
    );
  } else if (invitation.status === "accepted") {
    content = (
      <ExpiredCard
        title="Invitation déjà utilisée"
        message="Ce lien a déjà été accepté. Connectez-vous avec votre compte."
      />
    );
  } else if (invitation.status === "revoked") {
    content = (
      <ExpiredCard
        title="Invitation révoquée"
        message="Ce lien a été révoqué. Demandez une nouvelle invitation à votre administrateur."
      />
    );
  } else if (invitation.status === "expired") {
    content = (
      <ExpiredCard
        title="Invitation expirée"
        message="Ce lien a expiré. Demandez une nouvelle invitation à votre administrateur."
      />
    );
  } else {
    const expires = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
      new Date(invitation.expiresAt),
    );
    const scope =
      invitation.organizationId === null
        ? "Une organisation personnelle sera créée à votre nom, dont vous serez administrateur."
        : `Organisation : ${invitation.organizationName ?? "Organisation"} — rôle : ${
            ROLE_LABELS[invitation.role]
          }.`;
    content = (
      <section className="auth-card">
        <span className="eyebrow">Invitation</span>
        <h1>Rejoindre le dashboard</h1>
        <p className="hint" style={{ marginBottom: "0.5rem" }}>
          {scope}
        </p>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Lien valable jusqu&apos;au {expires}.
        </p>
        <AcceptInvitationForm token={token} />
      </section>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <span className="brand brand-logo">
          <BrandLogo />
        </span>
        <ThemeToggle />
      </div>
      {content}
    </main>
  );
}
