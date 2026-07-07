// Setup tab: country + scenario inputs, then run the on-device simulation.
import React from 'react';

import {
  Banner,
  Caption,
  Card,
  ChipRow,
  PrimaryButton,
  Screen,
  SectionTitle,
  StepperRow,
  fmtPct,
} from '@/components/sim/ui';
import { Collapsible } from '@/components/ui/collapsible';
import { useSimulation } from '@/context/simulation';
import { COUNTRIES } from '@/core/countryData';
import {
  LIFE_SCENARIO_OPTIONS,
  MIGRATION_PATH_OPTIONS,
  SPOUSE_INCOME_OPTIONS,
} from '@/core/scenarioBuilder';
import {
  CAR_PURCHASE_TIMING_OPTIONS,
  EDUCATION_MODE_OPTIONS,
  FIRST_CHILD_TIMING_OPTIONS,
  INVESTMENT_SPLIT_OPTIONS,
  PR_TIMING_OPTIONS,
  SECOND_CHILD_TIMING_OPTIONS,
} from '@/core/scenarioOptions';

export default function SetupScreen() {
  const sim = useSimulation();
  const s = sim.state;
  const currency = COUNTRIES.find((c) => c.name === s.country)?.currency ?? 'N/A';

  const pctStepper = (
    label: string,
    key: 'salary_growth_rate' | 'inflation_rate' | 'investment_return_rate'
  ) => (
    <StepperRow
      label={label}
      value={s[key]}
      onChange={(value) => sim.set({ [key]: value })}
      step={0.005}
      min={0}
      max={0.25}
      format={fmtPct}
    />
  );

  const multiplierStepper = (
    label: string,
    key: 'rent_multiplier' | 'tuition_multiplier' | 'childcare_multiplier'
  ) => (
    <StepperRow
      label={label}
      value={s[key]}
      onChange={(value) => sim.set({ [key]: value })}
      step={0.05}
      min={0.5}
      max={2}
      format={(value) => `${value.toFixed(2)}×`}
    />
  );

  return (
    <Screen title="GoldenPath">
      <Caption>10 year migration simulator</Caption>

      <Card>
        <SectionTitle>Country</SectionTitle>
        <ChipRow
          options={COUNTRIES.map((c) => c.name)}
          value={s.country}
          onChange={sim.setCountry}
        />
        <Caption>Local currency: {currency}</Caption>
      </Card>

      <Card>
        <SectionTitle>Scenario</SectionTitle>
        <ChipRow
          label="Migration path"
          options={Object.keys(MIGRATION_PATH_OPTIONS)}
          value={s.migration_path_label}
          onChange={sim.setMigrationPath}
        />
        <ChipRow
          label="Life scenario"
          options={Object.keys(LIFE_SCENARIO_OPTIONS)}
          value={s.life_scenario_label}
          onChange={(value) => sim.set({ life_scenario_label: value })}
        />
        <ChipRow
          label="Spouse income case"
          options={Object.keys(SPOUSE_INCOME_OPTIONS)}
          value={s.spouse_income_case_label}
          onChange={(value) => sim.set({ spouse_income_case_label: value })}
        />
        <ChipRow
          label="Car purchase"
          options={CAR_PURCHASE_TIMING_OPTIONS}
          value={s.car_purchase_timing_label}
          onChange={(value) => sim.set({ car_purchase_timing_label: value })}
        />
        <ChipRow
          label="Investment split"
          options={INVESTMENT_SPLIT_OPTIONS}
          value={s.investment_split_label}
          onChange={(value) => sim.set({ investment_split_label: value })}
        />
      </Card>

      <Card>
        <SectionTitle>Assumptions</SectionTitle>
        {pctStepper('Salary growth', 'salary_growth_rate')}
        {pctStepper('Inflation', 'inflation_rate')}
        {pctStepper('Investment return', 'investment_return_rate')}
        {multiplierStepper('Rent', 'rent_multiplier')}
        {multiplierStepper('Tuition', 'tuition_multiplier')}
        {multiplierStepper('Childcare', 'childcare_multiplier')}
        <Caption>Rates reset to the dataset defaults when you switch country.</Caption>
      </Card>

      <Card>
        <Collapsible title="Advanced scenario options">
          <ChipRow
            label="Education mode"
            options={EDUCATION_MODE_OPTIONS}
            value={s.education_mode_label}
            onChange={(value) => sim.set({ education_mode_label: value })}
          />
          <ChipRow
            label="PR timing"
            options={PR_TIMING_OPTIONS}
            value={s.pr_timing_label}
            onChange={(value) => sim.set({ pr_timing_label: value })}
          />
          {s.pr_timing_label === 'Custom PR year' && (
            <StepperRow
              label="Custom PR application year"
              value={s.custom_pr_year}
              onChange={(value) => sim.set({ custom_pr_year: value })}
              step={1}
              min={1}
              max={10}
              format={(value) => `Year ${value}`}
            />
          )}
          <ChipRow
            label="First child timing"
            options={FIRST_CHILD_TIMING_OPTIONS}
            value={s.first_child_timing_label}
            onChange={(value) => sim.set({ first_child_timing_label: value })}
          />
          <ChipRow
            label="Second child timing"
            options={SECOND_CHILD_TIMING_OPTIONS}
            value={s.second_child_timing_label}
            onChange={(value) => sim.set({ second_child_timing_label: value })}
          />
        </Collapsible>
      </Card>

      {sim.error && <Banner kind="bad" text={sim.error} />}
      {sim.results && !sim.isStale && (
        <Banner kind="good" text="Results are up to date — see the Dashboard tab." />
      )}
      {sim.results && sim.isStale && (
        <Banner kind="warn" text="Inputs changed since the last run. Run the simulation again." />
      )}

      <PrimaryButton
        title={sim.running ? 'Running…' : 'Run simulation'}
        onPress={sim.run}
        disabled={sim.running}
      />
    </Screen>
  );
}
