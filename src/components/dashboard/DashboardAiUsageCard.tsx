import {
  isTokenQuotaReached,
  type OrganizationAiUsageOverview,
  tokenQuotaRemaining,
} from "@/domain/entities/organization-ai-quota";

const tokenFormatter = new Intl.NumberFormat("fr-FR");
const GAUGE_RADIUS = 44;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

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
  const budgetUnlimited = budget === null || budget.maxTokens === null;
  const gaugeOffset = GAUGE_CIRCUMFERENCE * (1 - budgetPercent / 100);
  const gaugeLabel = budgetUnlimited
    ? "Quota global illimité"
    : `Quota global consommé à ${budgetPercent}%`;

  return (
    <section className="dash-panel dash-ai">
      <header className="dash-panel-head">
        <h2>Consommation IA</h2>
        <span className="dash-tag">Historique</span>
      </header>
      <div className="dash-panel-body">
        <div className="dash-ai-summary">
          <div className="dash-ai-total">
            <span className="dash-metric-label">Tokens consommés · toutes périodes</span>
            <strong>{tokens(usage.totalTokens)}</strong>
            <small>tokens</small>
            <p className="dash-note">Total cumulé de votre organisation</p>
          </div>
          <div className="dash-ai-gauge" role="img" aria-label={gaugeLabel}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle
                className="dash-ai-gauge-track"
                cx="60"
                cy="60"
                r={GAUGE_RADIUS}
                fill="none"
                transform="rotate(-90 60 60)"
              />
              {!budgetUnlimited ? (
                <circle
                  className="dash-ai-gauge-value"
                  cx="60"
                  cy="60"
                  r={GAUGE_RADIUS}
                  fill="none"
                  strokeDasharray={GAUGE_CIRCUMFERENCE}
                  strokeDashoffset={gaugeOffset}
                  transform="rotate(-90 60 60)"
                  style={{ stroke: budgetReached ? "var(--warning)" : "var(--accent)" }}
                />
              ) : null}
            </svg>
            <div className="dash-ai-gauge-center">
              <strong>{budgetUnlimited ? "∞" : `${budgetPercent}%`}</strong>
              <span>{budgetUnlimited ? "Illimité" : "période"}</span>
            </div>
          </div>
        </div>

        <div className="dash-ai-quota">
          <div className="dash-ai-quota-head">
            <span>Quota global — période en cours</span>
            <span className={`badge${budgetReached ? " orange" : ""}`}>
              {budgetUnlimited
                ? "Illimité"
                : budgetReached
                  ? "Épuisé"
                  : remainingLabel(budgetRemaining)}
            </span>
          </div>
          {budget !== null && budget.maxTokens !== null ? (
            <>
              <div className="dash-ai-quota-values">
                <strong>
                  {tokens(budget.tokensUsed)} / {tokens(budget.maxTokens)}
                </strong>
                <span>{budgetPercent}%</span>
              </div>
              <span
                className="dash-ai-bar"
                role="progressbar"
                aria-label="Consommation du quota global"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={budgetPercent}
              >
                <span style={{ width: `${budgetPercent}%` }} />
              </span>
            </>
          ) : (
            <p className="dash-note">
              {budget === null
                ? "Aucun quota global configuré : consommation illimitée."
                : `${tokens(budget.tokensUsed)} tokens consommés sur la période, sans plafond.`}
            </p>
          )}
          {budget !== null ? (
            <p className="dash-note">
              {budget.tokenResetMode === "duration" && budget.tokenResetDays !== null
                ? `Réinitialisation automatique tous les ${budget.tokenResetDays} jour(s).`
                : "Réinitialisation manuelle."}
            </p>
          ) : null}
        </div>

        <div className="dash-ai-allocations-block">
          <div className="dash-ai-allocations-title">
            <span>Quotas par modèle / cluster</span>
            <span>{usage.allocations.length}</span>
          </div>
          {usage.allocations.length === 0 ? (
            <p className="dash-note">Aucun quota par modèle ou cluster configuré.</p>
          ) : (
            <div className="dash-ai-allocations">
              {usage.allocations.map((allocation) => {
                const remaining = tokenQuotaRemaining(allocation.maxTokens, allocation.tokensUsed);
                const allocationPercent = percent(allocation.tokensUsed, allocation.maxTokens);
                const reached = isTokenQuotaReached(allocation.maxTokens, allocation.tokensUsed);
                return (
                  <article className="dash-ai-allocation" key={allocation.id}>
                    <div className="dash-ai-allocation-head">
                      <strong>{allocation.label}</strong>
                      <span className={`badge${reached ? " orange" : ""}`}>
                        {reached ? "Épuisé" : remainingLabel(remaining)}
                      </span>
                    </div>
                    <div className="dash-ai-allocation-meta">
                      <span>
                        {tokens(allocation.tokensUsed)}
                        {allocation.maxTokens === null
                          ? " / ∞"
                          : ` / ${tokens(allocation.maxTokens)}`}
                      </span>
                      <span>{allocation.target.kind === "cluster" ? "Cluster" : "Modèle"}</span>
                    </div>
                    {allocation.maxTokens === null ? null : (
                      <span
                        className="dash-ai-bar"
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
        </div>
      </div>
    </section>
  );
}
