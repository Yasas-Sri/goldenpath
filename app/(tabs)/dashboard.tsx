// Dashboard tab: headline verdict, key metrics, scenario ranking, risk panel.
import React from 'react';

import {
  Banner,
  Card,
  Caption,
  EmptyState,
  Metric,
  MetricGrid,
  Screen,
  SectionTitle,
  fmtMoney,
  usePalette,
} from '@/components/sim/ui';
import { useSimulation } from '@/context/simulation';

function healthBanner(finalNav: number, finalDebt: number, currency: string) {
  // Same verdict logic as the web app's financial health indicator.
  if (finalNav > 0 && finalDebt <= 0) {
    return {
      kind: 'good' as const,
      text: `Strong result: final NAV is positive at ${fmtMoney(finalNav, currency)} and final debt is not a major problem.`,
    };
  }
  if (finalNav > 0) {
    return {
      kind: 'warn' as const,
      text: `Mixed result: final NAV is positive at ${fmtMoney(finalNav, currency)}, but final debt/liabilities are still around ${fmtMoney(finalDebt, currency)}.`,
    };
  }
  if (finalNav === 0) {
    return {
      kind: 'info' as const,
      text: 'Neutral result: final NAV is around zero. This scenario has little financial margin.',
    };
  }
  return {
    kind: 'bad' as const,
    text: `Weak result: final NAV is negative at ${fmtMoney(finalNav, currency)}. This scenario is financially risky unless income, rent, tuition, or debt assumptions improve.`,
  };
}

export default function DashboardScreen() {
  const { results } = useSimulation();
  const p = usePalette();

  if (!results) {
    return (
      <Screen title="Dashboard">
        <EmptyState />
      </Screen>
    );
  }

  const cur = results.local_currency;
  const nav = results.nav_summary;
  const decision = results.decision_summary;
  const risk = results.risk_result;
  const comparison = results.comparison_result;

  const health = healthBanner(Number(nav.year_10_nav), Number(nav.year_10_total_debt), cur);
  const riskColor =
    risk.risk_level === 'High' ? p.bad : risk.risk_level === 'Medium' ? p.warn : p.good;

  return (
    <Screen title="Dashboard">
      <Caption>
        {results.selected_country} · {results.scenario_summary['Migration Path']} ·{' '}
        {results.scenario_summary['Life Scenario']}
      </Caption>

      <Banner kind={health.kind} text={health.text} />

      <Card>
        <SectionTitle>Decision summary</SectionTitle>
        <Caption>{decision.decision_sentence}</Caption>
        <MetricGrid>
          <Metric
            label="Final NAV (Year 10)"
            value={fmtMoney(nav.year_10_nav, cur)}
            sub={fmtMoney(nav.year_10_nav_lkr, 'LKR')}
            color={Number(nav.year_10_nav) >= 0 ? p.good : p.bad}
          />
          <Metric
            label="Break-even"
            value={nav.break_even_year != null ? `Year ${nav.break_even_year}` : 'None in 10 years'}
          />
          <Metric
            label="Biggest cost"
            value={String(decision.main_expense_category)}
            sub={fmtMoney(decision.main_expense_amount, cur)}
          />
          <Metric label="Biggest risk" value={String(decision.main_risk_variable)} />
        </MetricGrid>
      </Card>

      <Card>
        <SectionTitle>Year-10 balance sheet</SectionTitle>
        <MetricGrid>
          <Metric label="Total assets" value={fmtMoney(nav.year_10_total_assets, cur)} />
          <Metric label="Total liabilities" value={fmtMoney(nav.year_10_total_liabilities, cur)} />
          <Metric label="Cash savings" value={fmtMoney(nav.year_10_cash_savings, cur)} />
          <Metric label="Investments" value={fmtMoney(nav.year_10_investment_balance, cur)} />
          <Metric label="Superannuation" value={fmtMoney(nav.year_10_superannuation_balance, cur)} />
          <Metric label="Car value" value={fmtMoney(nav.year_10_car_value, cur)} />
          <Metric
            label="Lowest NAV"
            value={fmtMoney(nav.lowest_nav_amount, cur)}
            sub={`Year ${nav.lowest_nav_year}`}
            color={Number(nav.lowest_nav_amount) < 0 ? p.bad : undefined}
          />
          <Metric
            label="Highest debt"
            value={fmtMoney(nav.highest_debt_amount, cur)}
            sub={`Year ${nav.highest_debt_year}`}
          />
        </MetricGrid>
      </Card>

      <Card>
        <SectionTitle>Scenario ranking</SectionTitle>
        <Caption>{comparison.message}</Caption>
        <MetricGrid>
          <Metric
            label="Best scenario"
            value={String(comparison.best_scenario?.Scenario ?? 'Unavailable')}
            sub={fmtMoney(decision.best_scenario_final_nav, cur)}
          />
          <Metric
            label="Your rank"
            value={
              comparison.selected_rank != null
                ? `${comparison.selected_rank} of ${comparison.total_scenarios}`
                : 'Not ranked'
            }
          />
        </MetricGrid>
      </Card>

      <Card>
        <SectionTitle>Risk</SectionTitle>
        <MetricGrid>
          <Metric label="Risk level" value={String(risk.risk_level)} color={riskColor} />
          <Metric
            label="Most sensitive variable"
            value={String(risk.most_sensitive_variable?.variable ?? 'Unavailable')}
          />
        </MetricGrid>
        <Caption>Full sensitivity breakdown is on the Risk tab.</Caption>
      </Card>
    </Screen>
  );
}
