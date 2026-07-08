// Risk tab: risk level, tornado chart, best/worst case, full sensitivity table.
import React from 'react';

import {
  Banner,
  Card,
  Caption,
  DataTable,
  EmptyState,
  HBarChart,
  Metric,
  MetricGrid,
  Screen,
  SectionTitle,
  fmtNum,
  fmtPct,
  usePalette,
} from '@/components/sim/ui';
import { useSimulation } from '@/context/simulation';

export default function RiskScreen() {
  const { results } = useSimulation();
  const p = usePalette();

  if (!results) {
    return (
      <Screen title="Risk">
        <EmptyState />
      </Screen>
    );
  }

  const risk = results.risk_result;
  const riskKind =
    risk.risk_level === 'High' ? 'bad' : risk.risk_level === 'Medium' ? 'warn' : 'good';
  const riskColor = risk.risk_level === 'High' ? p.bad : risk.risk_level === 'Medium' ? p.warn : p.good;

  // Tornado is stored ascending by impact; show biggest risk first.
  const tornadoRows = [...results.tornado_df].reverse();

  const best = risk.best_case_nav ?? {};
  const worst = risk.worst_case_nav ?? {};
  const hasCases = best.variable != null || worst.variable != null;

  return (
    <Screen title="Risk">
      <Banner
        kind={riskKind}
        text={`Risk level: ${risk.risk_level}. Most sensitive variable: ${risk.most_sensitive_variable?.variable ?? 'Unavailable'}.`}
      />

      <Card>
        <SectionTitle>Sensitivity tornado (max impact on Year-10 NAV, %)</SectionTitle>
        <Caption>
          Each variable is shifted ±20% around the base scenario; the bar shows the largest
          resulting NAV swing.
        </Caption>
        <HBarChart
          rows={tornadoRows.map((row) => ({
            label: String(row['Variable']),
            value: Number(row['Max Impact %']),
            display: fmtPct(Number(row['Max Impact %'])),
          }))}
        />
      </Card>

      {hasCases && (
        <Card>
          <SectionTitle>Best / worst case</SectionTitle>
          <MetricGrid>
            <Metric
              label={`Best: ${best.variable ?? '—'} (${best.change_label ?? '—'})`}
              value={`LKR ${fmtNum(best.nav_lkr, 0)}`}
              color={p.good}
            />
            <Metric
              label={`Worst: ${worst.variable ?? '—'} (${worst.change_label ?? '—'})`}
              value={`LKR ${fmtNum(worst.nav_lkr, 0)}`}
              color={riskColor}
            />
          </MetricGrid>
        </Card>
      )}

      <Card>
        <SectionTitle>Summary</SectionTitle>
        <Caption>{String(risk.risk_summary_text)}</Caption>
      </Card>

      <Card>
        <SectionTitle>All sensitivity runs</SectionTitle>
        <DataTable
          rows={results.sensitivity_df}
          columns={[
            { key: 'Variable', width: 130, align: 'left' },
            { key: 'Change Label', label: 'Change', width: 70, align: 'left' },
            {
              key: 'Year-10 NAV Local',
              label: `NAV ${results.local_currency}`,
              width: 120,
              format: (v) => fmtNum(v, 0),
            },
            { key: 'Delta NAV Local', label: 'Δ NAV', width: 120, format: (v) => fmtNum(v, 0) },
            { key: 'Delta % Local', label: 'Δ %', width: 80, format: (v) => fmtPct(Number(v)) },
          ]}
        />
      </Card>
    </Screen>
  );
}
