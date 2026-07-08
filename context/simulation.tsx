// Single app-wide store for scenario inputs + simulation results.
// ponytail: plain React context, no state library — one simulation, one consumer tree.
import React, { createContext, useContext, useMemo, useState } from "react";

import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  getAllCountryDatasets,
  getDatasetForCountry,
} from "@/core/countryData";
import { validateDataset } from "@/core/datasetValidator";
import { getDefaultModelInputs, ScenarioInputs } from "@/core/scenarioBuilder";
import { runFullSimulation, SimulationOutputs } from "@/core/simulation";

export interface SetupState {
  country: string;
  migration_path_label: string;
  life_scenario_label: string;
  spouse_income_case_label: string;
  car_purchase_timing_label: string;
  investment_split_label: string;
  education_mode_label: string;
  pr_timing_label: string;
  custom_pr_year: number;
  first_child_timing_label: string;
  second_child_timing_label: string;
  salary_growth_rate: number;
  inflation_rate: number;
  investment_return_rate: number;
  rent_multiplier: number;
  tuition_multiplier: number;
  childcare_multiplier: number;
}

function rateDefaults(country: string) {
  try {
    const d = getDefaultModelInputs(getDatasetForCountry(country));
    return {
      salary_growth_rate: d.salary_growth_rate,
      inflation_rate: d.inflation_rate,
      investment_return_rate: d.investment_return_rate,
      rent_multiplier: 1.0,
      tuition_multiplier: 1.0,
      childcare_multiplier: 1.0,
    };
  } catch {
    // Invalid dataset (e.g. Singapore) — run() will surface the real error.
    return {
      salary_growth_rate: 0.03,
      inflation_rate: 0.03,
      investment_return_rate: 0.06,
      rent_multiplier: 1.0,
      tuition_multiplier: 1.0,
      childcare_multiplier: 1.0,
    };
  }
}

function educationDefault(migrationPathLabel: string): string {
  return migrationPathLabel === "Student visa path" ? "Master’s full-time" : "No further study";
}

function initialState(): SetupState {
  const country = COUNTRIES.some((c) => c.name === DEFAULT_COUNTRY)
    ? DEFAULT_COUNTRY
    : COUNTRIES[0].name;
  return {
    country,
    migration_path_label: "Student visa path",
    life_scenario_label: "Single",
    spouse_income_case_label: "Moderate",
    car_purchase_timing_label: "No car",
    investment_split_label: "Save only",
    education_mode_label: educationDefault("Student visa path"),
    pr_timing_label: "Normal PR",
    custom_pr_year: 6,
    first_child_timing_label: "Dataset default",
    second_child_timing_label: "Dataset default",
    ...rateDefaults(country),
  };
}

function toScenarioInputs(s: SetupState): ScenarioInputs {
  return {
    migration_path_label: s.migration_path_label,
    life_scenario_label: s.life_scenario_label,
    // Timing/split pickers subsume the old basic toggles (same coupling as the web app).
    car_option_label: s.car_purchase_timing_label === "No car" ? "No car" : "Buy car",
    investment_option_label:
      s.investment_split_label === "Save only" ? "Save only" : "Invest positive cash flow",
    spouse_income_case_label: s.spouse_income_case_label,
    salary_growth_rate: s.salary_growth_rate,
    inflation_rate: s.inflation_rate,
    investment_return_rate: s.investment_return_rate,
    rent_multiplier: s.rent_multiplier,
    tuition_multiplier: s.tuition_multiplier,
    childcare_multiplier: s.childcare_multiplier,
    education_mode_label: s.education_mode_label,
    pr_timing_label: s.pr_timing_label,
    custom_pr_year: s.pr_timing_label === "Custom PR year" ? s.custom_pr_year : null,
    car_purchase_timing_label: s.car_purchase_timing_label,
    first_child_timing_label: s.first_child_timing_label,
    second_child_timing_label: s.second_child_timing_label,
    investment_split_label: s.investment_split_label,
  };
}

interface SimContextValue {
  state: SetupState;
  set: (patch: Partial<SetupState>) => void;
  setCountry: (country: string) => void;
  setMigrationPath: (label: string) => void;
  run: () => void;
  running: boolean;
  results: SimulationOutputs | null;
  error: string | null;
  isStale: boolean;
}

const SimContext = createContext<SimContextValue | null>(null);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SetupState>(initialState);
  const [results, setResults] = useState<SimulationOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [ranKey, setRanKey] = useState("");

  const set = (patch: Partial<SetupState>) => setState((s) => ({ ...s, ...patch }));

  const setCountry = (country: string) =>
    setState((s) => ({ ...s, country, ...rateDefaults(country) }));

  const setMigrationPath = (label: string) =>
    setState((s) => ({
      ...s,
      migration_path_label: label,
      education_mode_label: educationDefault(label),
    }));

  const run = () => {
    if (running) return;
    setRunning(true);
    const snapshot = state;
    // ponytail: sim is a few thousand plain-array loops (<100ms); the timeout
    // just lets the "Running…" state paint before the synchronous work.
    setTimeout(() => {
      try {
        const dataset = getDatasetForCountry(snapshot.country);
        validateDataset(dataset); // same gate as the web app's load step
        const outputs = runFullSimulation(
          snapshot.country,
          dataset,
          getAllCountryDatasets(),
          toScenarioInputs(snapshot)
        );
        setResults(outputs);
        setError(null);
        setRanKey(JSON.stringify(snapshot));
      } catch (e) {
        setResults(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const isStale = results !== null && ranKey !== JSON.stringify(state);

  const value = useMemo(
    () => ({ state, set, setCountry, setMigrationPath, run, running, results, error, isStale }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, running, results, error, isStale]
  );

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSimulation(): SimContextValue {
  const value = useContext(SimContext);
  if (!value) throw new Error("useSimulation must be used inside SimulationProvider");
  return value;
}
