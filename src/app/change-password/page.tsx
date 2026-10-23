import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getCurrentUser } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changer le mot de passe",
};

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (user === null) {
    redirect("/login");
  }

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <span className="eyebrow">Sécurité</span>
        <h1>Changer le mot de passe</h1>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Votre mot de passe doit être renouvelé avant d'accéder au dashboard.
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
