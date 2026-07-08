// Full simulation pipeline for one country + scenario (app.py run_nav_simulation).
import { Dataset, Row } from "./dataset";
import { buildScenarioConfig, ScenarioInputs, createScenarioSummary } from "./scenarioBuilder";
import { calculateYearlyIncome, getIncomeSummary } from "./incomeModel";
import { calculateYearlyExpenses, getExpenseSummary } from "./expenseModel";
import { calculateNavSimulation, getNavSummary, createFinalSimulationTable } from "./navModel";
import { buildScenarioComparison, compareSelectedVsBest, ComparisonInputs } from "./comparisonModel";
import { buildCountryComparison, CountryDataset } from "./countryComparison";
import { buildSensitivityAnalysis } from "./sensitivity";
import {
  getMostSensitiveVariable,
  getBestCaseNav,
  getWorstCaseNav,
  getRiskLevel,
  getRiskSummaryText,
} from "./riskModel";
import { buildDecisionSummary } from "./decisionSummary";
import { getCountryCurrency, getExchangeRateToLkr } from "./currency";

export interface SimulationOutputs {
  selected_country: string;
  local_currency: string;
  income_df: Row[];
  expense_df: Row[];
  nav_df: Row[];
  final_simulation_df: Row[];
  income_summary: Record<string, number>;
  expense_summary: Record<string, number>;
  nav_summary: Record<string, any>;
  scenario_summary: Record<string, any>;
  comparison_df: Row[];
  comparison_result: Record<string, any>;
  country_comparison_df: Row[];
  sensitivity_df: Row[];
  tornado_df: Row[];
  risk_result: Record<string, any>;
  decision_summary: Record<string, any>;
  exchange_rate: number;
}

export function runFullSimulation(
  selectedCountry: string,
  dataset: Dataset,
  countryDatasets: CountryDataset[],
  inputs: ScenarioInputs
): SimulationOutputs {
  const localCurrency = getCountryCurrency(dataset);
  const exchangeRate = getExchangeRateToLkr(dataset);

  const scenarioConfig = buildScenarioConfig(dataset, inputs);
  const scenarioSummary = createScenarioSummary(scenarioConfig);

  const incomeDf = calculateYearlyIncome(dataset, scenarioConfig);
  const expenseDf = calculateYearlyExpenses(dataset, scenarioConfig);
  const navDf = calculateNavSimulation(dataset, scenarioConfig, incomeDf, expenseDf);
  const finalSimulationDf = createFinalSimulationTable(incomeDf, expenseDf, navDf);

  const comparisonInputs: ComparisonInputs = { ...inputs };

  const comparisonDf = buildScenarioComparison(dataset, comparisonInputs);

  const countryComparisonDf = buildCountryComparison(
    countryDatasets,
    inputs.migration_path_label,
    inputs.life_scenario_label,
    comparisonInputs
  );

  const sensitivityResult = buildSensitivityAnalysis(dataset, scenarioConfig);

  const comparisonResult = compareSelectedVsBest(
    comparisonDf,
    inputs.migration_path_label,
    inputs.life_scenario_label
  );

  const mostSensitiveVariable = getMostSensitiveVariable(sensitivityResult.tornado_df);
  const bestCaseNav = getBestCaseNav(sensitivityResult.sensitivity_df);
  const worstCaseNav = getWorstCaseNav(sensitivityResult.sensitivity_df);
  const riskLevel = getRiskLevel(sensitivityResult.sensitivity_df, sensitivityResult.tornado_df);

  const riskSummaryText = getRiskSummaryText(
    comparisonResult,
    mostSensitiveVariable,
    bestCaseNav,
    worstCaseNav,
    riskLevel
  );

  const decisionSummary = buildDecisionSummary(
    incomeDf,
    expenseDf,
    navDf,
    comparisonDf,
    sensitivityResult.sensitivity_df,
    sensitivityResult.tornado_df,
    exchangeRate,
    localCurrency
  );

  return {
    selected_country: selectedCountry,
    local_currency: localCurrency,
    income_df: incomeDf,
    expense_df: expenseDf,
    nav_df: navDf,
    final_simulation_df: finalSimulationDf,
    income_summary: getIncomeSummary(incomeDf),
    expense_summary: getExpenseSummary(expenseDf),
    nav_summary: getNavSummary(navDf),
    scenario_summary: scenarioSummary,
    comparison_df: comparisonDf,
    comparison_result: comparisonResult,
    country_comparison_df: countryComparisonDf,
    sensitivity_df: sensitivityResult.sensitivity_df,
    tornado_df: sensitivityResult.tornado_df,
    risk_result: {
      most_sensitive_variable: mostSensitiveVariable,
      best_case_nav: bestCaseNav,
      worst_case_nav: worstCaseNav,
      risk_level: riskLevel,
      risk_summary_text: riskSummaryText,
    },
    decision_summary: decisionSummary,
    exchange_rate: exchangeRate,
  };
}
