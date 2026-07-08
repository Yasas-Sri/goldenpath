// Details tab: year-by-year income / expenses / NAV with chart + table.
import React, { useState } from 'react';

import {
  Card,
  Caption,
  ChipRow,
  DataTable,
  EmptyState,
  Metric,
  MetricGrid,
  Screen,
  SectionTitle,
  TableColumn,
  YearBarChart,
  fmtMoney,
  fmtNum,
} from '@/components/sim/ui';
import { useSimulation } from '@/context/simulation';
import { Row } from '@/core/dataset';

const VIEWS = ['Income', 'Expenses', 'NAV'] as const;
type ViewName = (typeof VIEWS)[number];

const money: TableColumn['format'] = (value) => fmtNum(value, 0);

const TABLE_COLUMNS: Record<ViewName, TableColumn[]> = {
  Income: [
    { key: 'Year', width: 50, align: 'left' },
    { key: 'Career Stage', width: 110, align: 'left' },
    { key: 'Student Part-Time Income', label: 'Part-Time', format: money },
    { key: 'Full-Time Employment Income', label: 'Full-Time', format: money },
    { key: 'Spouse Income', format: money },
    { key: 'Gross Income', format: money },
    { key: 'Tax', format: money },
    { key: 'Superannuation', format: money },
    { key: 'Net Income', format: money },
  ],
  Expenses: [
    { key: 'Year', width: 50, align: 'left' },
    { key: 'Rent', format: money },
    { key: 'General Living', format: money },
    { key: 'Tuition', format: money },
    { key: 'Visa Fees', format: money },
    { key: 'Childcare', format: money },
    { key: 'Car Cost', format: money },
    { key: 'Debt Cost', format: money },
    { key: 'Total Expenses', format: money },
  ],
  NAV: [
    { key: 'Year', width: 50, align: 'left' },
    { key: 'Cash Flow', format: money },
    { key: 'Total Assets', format: money },
    { key: 'Total Debt', format: money },
    { key: 'Interest Paid', format: money },
    { key: 'Local Currency NAV', label: 'NAV', format: money },
    { key: 'LKR NAV', format: money },
  ],
};

const CHART_COLUMN: Record<ViewName, string> = {
  Income: 'Net Income',
  Expenses: 'Total Expenses',
  NAV: 'Local Currency NAV',
};

export default function DetailsScreen() {
  const { results } = useSimulation();
  const [view, setView] = useState<ViewName>('NAV');

  if (!results) {
    return (
      <Screen title="Details">
        <EmptyState />
      </Screen>
    );
  }

  const cur = results.local_currency;
  const df: Row[] =
    view === 'Income' ? results.income_df : view === 'Expenses' ? results.expense_df : results.nav_df;

  const chartPoints = df.map((row) => ({
    label: String(row['Year']),
    value: Number(row[CHART_COLUMN[view]] ?? 0),
  }));

  const summaryMetrics = () => {
    if (view === 'Income') {
      const s = results.income_summary;
      return (
        <MetricGrid>
          <Metric label="Total net income" value={fmtMoney(s.total_net_income, cur)} />
          <Metric label="Total tax" value={fmtMoney(s.total_tax, cur)} />
          <Metric label="Total superannuation" value={fmtMoney(s.total_superannuation, cur)} />
          <Metric label="Year-10 net income" value={fmtMoney(s.year_10_net_income, cur)} />
        </MetricGrid>
      );
    }
    if (view === 'Expenses') {
      const s = results.expense_summary;
      return (
        <MetricGrid>
          <Metric label="Total expenses" value={fmtMoney(s.total_expenses, cur)} />
          <Metric label="Total rent" value={fmtMoney(s.total_rent, cur)} />
          <Metric label="Total tuition" value={fmtMoney(s.total_tuition, cur)} />
          <Metric label="Total car cost" value={fmtMoney(s.total_car_cost, cur)} />
        </MetricGrid>
      );
    }
    const s = results.nav_summary;
    return (
      <MetricGrid>
        <Metric label="Year-10 NAV" value={fmtMoney(s.year_10_nav, cur)} />
        <Metric label="Total interest paid" value={fmtMoney(s.total_interest_paid, cur)} />
        <Metric label="Total debt repayment" value={fmtMoney(s.total_debt_repayment, cur)} />
        <Metric label="Debt-to-income (Y10)" value={fmtNum(s.year_10_debt_to_income_ratio, 2)} />
      </MetricGrid>
    );
  };

  return (
    <Screen title="Details">
      <ChipRow options={VIEWS} value={view} onChange={(v) => setView(v as ViewName)} />

      <Card>
        <SectionTitle>
          {CHART_COLUMN[view]} by year ({cur})
        </SectionTitle>
        <YearBarChart points={chartPoints} />
      </Card>

      <Card>
        <SectionTitle>Summary</SectionTitle>
        {summaryMetrics()}
      </Card>

      <Card>
        <SectionTitle>Year-by-year table</SectionTitle>
        <Caption>Values in {cur}. Scroll sideways for more columns.</Caption>
        <DataTable rows={df} columns={TABLE_COLUMNS[view]} />
      </Card>
    </Screen>
  );
}
