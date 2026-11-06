import {
  isTokenQuotaReached,
  type OrganizationAiUsageOverview,
  tokenQuotaRemaining,
} from "@/domain/entities/organization-ai-quota";

const tokenFormatter = new Intl.NumberFormat("fr-FR");

function tokens(value: number): string {
  return tokenFormatter.format(value);
}

function percent(used: number, max: number | null): number {
  if (max === null) return 0;
  if (max === 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}

function remainingLabel(remaining: number | null): string {
  return remaining === null ? "Illimité" : `${tokens(remaining)} restant(s)`;
}

export function DashboardAiUsageCard({ usage }: { usage: OrganizationAiUsageOverview }) {
  const budget = usage.budget;
  const budgetRemaining =
    budget === null ? null : tokenQuotaRemaining(budget.maxTokens, budget.tokensUsed);
  const budgetPercent = budget === null ? 0 : percent(budget.tokensUsed, budget.maxTokens);
  const budgetReached = budget !== null && isTokenQuotaReached(budget.maxTokens, budget.tokensUsed);

  return (
    <section className="card dashboard-ai-usage">
      <header className="dashboard-ai-usage-head">
        <div>
          <span className="eyebrow">Consommation IA</span>
          <h2>Tokens de votre organisation</h2>
          <p className="hint">
            Total historique, toutes périodes confondues, et quotas configurés par le
            super-administrateur.
          </p>
        </div>
        <div className="dashboard-ai-total">
          <span>Total consommé</span>
          <strong>{tokens(usage.totalTokens)}</strong>
          <small>tokens</small>
        </div>
      </header>

      <div className="dashboard-ai-grid">
        <section className="dashboard-ai-block">
          <h3>Quota global — période en cours</h3>
          {budget === null ? (
            <p className="hint">Aucun quota global configuré : consommation illimitée.</p>
          ) : (
            <>
              <div className="dashboard-ai-quota-head">
                <strong>
                  {tokens(budget.tokensUsed)}
                  {budget.maxTokens === null ? " / ∞" : ` / ${tokens(budget.maxTokens)}`}
                </strong>
                <span className={`badge${budgetReached ? " orange" : ""}`}>
                  {budgetReached ? "épuisé" : remainingLabel(budgetRemaining)}
                </span>
              </div>
              {budget.maxTokens === null ? null : (
                <span
                  className="quota-bar dashboard-ai-bar"
                  role="progressbar"
                  aria-label="Consommation du quota global"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={budgetPercent}
                >
                  <span style={{ width: `${budgetPercent}%` }} />
                </span>
              )}
              <p className="hint">
                {budget.tokenResetMode === "duration" && budget.tokenResetDays !== null
                  ? `Réinitialisation automatique tous les ${budget.tokenResetDays} jour(s).`
                  : "Réinitialisation manuelle."}
              </p>
            </>
          )}
        </section>

        <section className="dashboard-ai-block">
          <h3>Quotas par modèle / cluster — période en cours</h3>
          {usage.allocations.length === 0 ? (
            <p className="hint">Aucun quota par modèle ou cluster configuré.</p>
          ) : (
            <div className="dashboard-ai-allocations">
              {usage.allocations.map((allocation) => {
                const remaining = tokenQuotaRemaining(allocation.maxTokens, allocation.tokensUsed);
                const allocationPercent = percent(allocation.tokensUsed, allocation.maxTokens);
                const reached = isTokenQuotaReached(allocation.maxTokens, allocation.tokensUsed);
                return (
                  <article className="dashboard-ai-allocation" key={allocation.id}>
                    <div className="dashboard-ai-allocation-head">
                      <strong>{allocation.label}</strong>
                      <span className={`badge${reached ? " orange" : ""}`}>
                        {reached ? "épuisé" : remainingLabel(remaining)}
                      </span>
                    </div>
                    <div className="dashboard-ai-quota-head">
                      <small>
                        {tokens(allocation.tokensUsed)}
                        {allocation.maxTokens === null
                          ? " / ∞"
                          : ` / ${tokens(allocation.maxTokens)}`}
                      </small>
                      <small>{allocation.target.kind === "cluster" ? "Cluster" : "Modèle"}</small>
                    </div>
                    {allocation.maxTokens === null ? null : (
                      <span
                        className="quota-bar dashboard-ai-bar"
                        role="progressbar"
                        aria-label={`Consommation de ${allocation.label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={allocationPercent}
                      >
                        <span style={{ width: `${allocationPercent}%` }} />
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
