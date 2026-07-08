import { Dataset, Row, ScenarioConfig } from "./dataset";
import { getCountryCurrency, getExchangeRateToLkr } from "./currency";
import { runSingleNavSimulation } from "./comparisonModel";
import { pyround } from "./pyround";

export const SENSITIVITY_LEVELS = [-0.2, -0.1, 0.0, 0.1, 0.2];

export const SENSITIVITY_VARIABLES = [
  "Salary growth",
  "Rent",
  "Tuition",
  "Childcare",
  "Investment return",
  "Exchange rate",
  "Spouse income percentage",
];

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

export function getImpactDirection(deltaNavLkr: number): string {
  if (deltaNavLkr > 0) return "Improves NAV";
  if (deltaNavLkr < 0) return "Reduces NAV";
  return "No change";
}

/** Python f"{change * 100:+.0f}%" — e.g. +10%, -20%. */
function changeLabel(change: number): string {
  const percent = Math.round(change * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function getRiskInterpretation(
  variableName: string,
  change: number,
  deltaNavLkr: number
): string {
  const direction = getImpactDirection(deltaNavLkr);

  if (change === 0) return "Base case";

  const label = changeLabel(change);

  if (direction === "Reduces NAV") {
    return `${variableName} at ${label} hurts the selected scenario.`;
  }
  if (direction === "Improves NAV") {
    return `${variableName} at ${label} helps the selected scenario.`;
  }
  return `${variableName} at ${label} has no material NAV effect.`;
}

export function applySensitivityChange(
  baseScenarioConfig: ScenarioConfig,
  variableName: string,
  change: number
): ScenarioConfig {
  const scenarioConfig = structuredClone(baseScenarioConfig);
  const adjustableInputs = scenarioConfig["adjustable_inputs"];

  if (variableName === "Salary growth") {
    adjustableInputs["salary_growth_rate"] = clamp(
      adjustableInputs["salary_growth_rate"] * (1 + change),
      0.0,
      1.0
    );
  } else if (variableName === "Rent") {
    adjustableInputs["rent_multiplier"] = clamp(
      adjustableInputs["rent_multiplier"] * (1 + change),
      0.0,
      10.0
    );
  } else if (variableName === "Tuition") {
    adjustableInputs["tuition_multiplier"] = clamp(
      adjustableInputs["tuition_multiplier"] * (1 + change),
      0.0,
      10.0
    );
  } else if (variableName === "Childcare") {
    adjustableInputs["childcare_multiplier"] = clamp(
      adjustableInputs["childcare_multiplier"] * (1 + change),
      0.0,
      10.0
    );
  } else if (variableName === "Investment return") {
    adjustableInputs["investment_return_rate"] = clamp(
      adjustableInputs["investment_return_rate"] * (1 + change),
      0.0,
      1.0
    );
  } else if (variableName === "Spouse income percentage") {
    scenarioConfig["spouse_income_settings"]["income_percentage"] = clamp(
      scenarioConfig["spouse_income_settings"]["income_percentage"] * (1 + change),
      0.0,
      1.0
    );
  } else if (variableName === "Exchange rate") {
    // Exchange rate does not change the config; NAV LKR is scaled post-hoc.
  } else {
    throw new Error(`Unknown sensitivity variable: ${variableName}`);
  }

  return scenarioConfig;
}

export interface SensitivityResult {
  sensitivity_df: Row[];
  tornado_df: Row[];
}

export function buildSensitivityAnalysis(
  dataset: Dataset,
  baseScenarioConfig: ScenarioConfig
): SensitivityResult {
  const localCurrency = getCountryCurrency(dataset);
  const baseExchangeRate = getExchangeRateToLkr(dataset);

  const baseResult = runSingleNavSimulation(dataset, baseScenarioConfig);

  const baseNavLocal = Number(baseResult.nav_summary["year_10_nav"]);
  const baseNavLkr = baseNavLocal * baseExchangeRate;

  const records: Row[] = [];

  for (const variableName of SENSITIVITY_VARIABLES) {
    for (const change of SENSITIVITY_LEVELS) {
      let tempExchangeRate = baseExchangeRate;
      let tempScenarioConfig: ScenarioConfig;

      if (variableName === "Exchange rate") {
        tempExchangeRate = baseExchangeRate * (1 + change);
        tempScenarioConfig = structuredClone(baseScenarioConfig);
      } else {
        tempScenarioConfig = applySensitivityChange(baseScenarioConfig, variableName, change);
      }

      const tempResult = runSingleNavSimulation(dataset, tempScenarioConfig);

      const tempNavLocal = Number(tempResult.nav_summary["year_10_nav"]);
      const tempNavLkr = tempNavLocal * tempExchangeRate;

      const deltaNavLocal = tempNavLocal - baseNavLocal;
      const deltaNavLkr = tempNavLkr - baseNavLkr;

      const deltaPercentLocal = baseNavLocal !== 0 ? deltaNavLocal / Math.abs(baseNavLocal) : 0.0;
      const deltaPercentLkr = baseNavLkr !== 0 ? deltaNavLkr / Math.abs(baseNavLkr) : 0.0;

      records.push({
        Variable: variableName,
        Change: change,
        "Change Label": change === 0 ? "Base" : changeLabel(change),
        "Local Currency": localCurrency,
        "Exchange Rate to LKR": pyround(tempExchangeRate, 4),

        "Year-10 NAV Local": pyround(tempNavLocal, 2),
        [`Year-10 NAV ${localCurrency}`]: pyround(tempNavLocal, 2),
        "Year-10 NAV LKR": pyround(tempNavLkr, 2),

        "Base NAV Local": pyround(baseNavLocal, 2),
        [`Base NAV ${localCurrency}`]: pyround(baseNavLocal, 2),
        "Base NAV LKR": pyround(baseNavLkr, 2),

        "Delta NAV Local": pyround(deltaNavLocal, 2),
        [`Delta NAV ${localCurrency}`]: pyround(deltaNavLocal, 2),
        "Delta NAV LKR": pyround(deltaNavLkr, 2),

        "Delta % Local": pyround(deltaPercentLocal, 4),
        "Delta % LKR": pyround(deltaPercentLkr, 4),

        "Impact Direction": getImpactDirection(deltaNavLkr),
        "Risk Interpretation": getRiskInterpretation(variableName, change, deltaNavLkr),
      });
    }
  }

  const tornadoRecords: Row[] = [];

  for (const variableName of SENSITIVITY_VARIABLES) {
    const variableRows = records.filter((row) => row["Variable"] === variableName);

    const maxAbs = (column: string) =>
      Math.max(...variableRows.map((row) => Math.abs(Number(row[column]))));

    tornadoRecords.push({
      Variable: variableName,
      "Local Currency": localCurrency,
      "Max Impact Local": pyround(maxAbs("Delta NAV Local"), 2),
      [`Max Impact ${localCurrency}`]: pyround(maxAbs("Delta NAV Local"), 2),
      "Max Impact LKR": pyround(maxAbs("Delta NAV LKR"), 2),
      "Max Impact %": pyround(maxAbs("Delta % LKR"), 4),
    });
  }

  // Dense rank on Max Impact %, descending (pandas rank(method="dense")).
  const uniqueImpactsDesc = [...new Set(tornadoRecords.map((row) => Number(row["Max Impact %"])))]
    .sort((a, b) => b - a);

  for (const row of tornadoRecords) {
    row["Impact Rank"] = uniqueImpactsDesc.indexOf(Number(row["Max Impact %"])) + 1;
  }

  const tornadoDf = [...tornadoRecords].sort(
    (a, b) => Number(a["Max Impact %"]) - Number(b["Max Impact %"])
  );

  return {
    sensitivity_df: records,
    tornado_df: tornadoDf,
  };
}
