// Compare tab: scenario ranking for the selected country + cross-country comparison.
import React, { useState } from 'react';

import {
  Banner,
  Card,
  Caption,
  ChipRow,
  DataTable,
  EmptyState,
  HBarChart,
  Screen,
  SectionTitle,
  TableColumn,
  fmtNum,
} from '@/components/sim/ui';
import { useSimulation } from '@/context/simulation';

const VIEWS = ['Scenarios', 'Countries'] as const;

const money: TableColumn['format'] = (value) => fmtNum(value, 0);

export default function CompareScreen() {
  const { results } = useSimulation();
  const [view, setView] = useState<(typeof VIEWS)[number]>('Scenarios');

  if (!results) {
    return (
      <Screen title="Compare">
        <EmptyState />
      </Screen>
    );
  }

  const cur = results.local_currency;

  const scenariosView = () => {
    const rows = results.comparison_df;
    const selectedName = `${results.scenario_summary['Migration Path']} + ${results.scenario_summary['Life Scenario']}`;
    return (
      <>
        <Banner kind="info" text={String(results.comparison_result.message)} />
        <Card>
          <SectionTitle>All 8 scenarios by Year-10 NAV ({cur})</SectionTitle>
          <HBarChart
            rows={rows.map((row) => ({
              label: `${row['Rank']}. ${row['Scenario']}${row['Scenario'] === selectedName ? ' ★' : ''}`,
              value: Number(row['Year-10 NAV Local']),
              display: fmtNum(row['Year-10 NAV Local'], 0),
              highlight: row['Scenario'] === selectedName,
            }))}
          />
          <Caption>★ your selected scenario</Caption>
        </Card>
        <Card>
          <SectionTitle>Details</SectionTitle>
          <DataTable
            rows={rows}
            columns={[
              { key: 'Rank', width: 50, align: 'left' },
              { key: 'Scenario', width: 230, align: 'left' },
              { key: 'Year-10 NAV Local', label: `NAV ${cur}`, width: 120, format: money },
              { key: 'Year-10 NAV LKR', label: 'NAV LKR', width: 140, format: money },
              { key: 'Total Income Local', label: 'Total income', width: 120, format: money },
              { key: 'Total Expenses Local', label: 'Total expenses', width: 120, format: money },
            ]}
          />
        </Card>
      </>
    );
  };

  const countriesView = () => {
    const rows = results.country_comparison_df;
    const okRows = rows.filter((row) => row['Status'] === 'OK');
    const failedRows = rows.filter((row) => row['Status'] !== 'OK');
    return (
      <>
        <Card>
          <SectionTitle>Same scenario across countries (Year-10 NAV, LKR)</SectionTitle>
          <Caption>{String(rows[0]?.['Scenario'] ?? '')}</Caption>
          <HBarChart
            rows={okRows.map((row) => ({
              label: `${row['Country Rank']}. ${row['Country']}`,
              value: Number(row['Final NAV LKR']),
              display: fmtNum(row['Final NAV LKR'], 0),
              highlight: row['Country'] === results.selected_country,
            }))}
          />
        </Card>
        <Card>
          <SectionTitle>Details</SectionTitle>
          <DataTable
            rows={okRows}
            columns={[
              { key: 'Country Rank', label: 'Rank', width: 50, align: 'left' },
              { key: 'Country', width: 110, align: 'left' },
              { key: 'Currency', width: 70, align: 'left' },
              { key: 'Final NAV Local', label: 'NAV local', width: 120, format: money },
              { key: 'Final NAV LKR', label: 'NAV LKR', width: 140, format: money },
              { key: 'Break-even Year', label: 'Break-even', width: 100, align: 'left' },
              { key: 'Highest Debt', width: 110, format: money },
              { key: 'Risk Score', width: 90, format: (v) => fmtNum(v, 1) },
            ]}
          />
        </Card>
        {failedRows.map((row) => (
          <Banner
            key={String(row['Country'])}
            kind="bad"
            text={`${row['Country']}: dataset failed validation — ${row['Error']}`}
          />
        ))}
      </>
    );
  };

  return (
    <Screen title="Compare">
      <ChipRow options={VIEWS} value={view} onChange={(v) => setView(v as (typeof VIEWS)[number])} />
      {view === 'Scenarios' ? scenariosView() : countriesView()}
    </Screen>
  );
}
