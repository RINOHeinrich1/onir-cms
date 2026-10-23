import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getCurrentUser } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user !== null) {
    redirect(user.mustChangePassword ? "/change-password" : "/");
  }

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <span className="eyebrow">ONIR CMS</span>
        <h1>Connexion</h1>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Accédez à votre espace de prospection.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
