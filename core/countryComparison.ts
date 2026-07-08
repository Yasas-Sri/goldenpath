import { Dataset, Row } from "./dataset";
import { buildScenarioConfig, ScenarioInputs } from "./scenarioBuilder";
import { calculateYearlyIncome } from "./incomeModel";
import { calculateYearlyExpenses } from "./expenseModel";
import { calculateNavSimulation, getNavSummary } from "./navModel";
import {
  getDatasetCountry,
  getDatasetCurrency,
  getExchangeRateFromDataset,
  getFinalNavFromSummary,
  ComparisonInputs,
} from "./comparisonModel";
import { validateDataset } from "./datasetValidator";
import { pyround } from "./pyround";

function safeMinFromCandidates(df: Row[], candidates: string[], defaultValue = 0.0): number {
  if (!df || df.length === 0) return defaultValue;
  for (const column of candidates) {
    if (column in df[0]) {
      return Math.min(...df.map((row) => Number(row[column] ?? 0)));
    }
  }
  return defaultValue;
}

function safeMaxFromCandidates(df: Row[], candidates: string[], defaultValue = 0.0): number {
  if (!df || df.length === 0) return defaultValue;
  for (const column of candidates) {
    if (column in df[0]) {
      return Math.max(...df.map((row) => Number(row[column] ?? 0)));
    }
  }
  return defaultValue;
}

function safeSumFromCandidates(df: Row[], candidates: string[], defaultValue = 0.0): number {
  if (!df || df.length === 0) return defaultValue;
  for (const column of candidates) {
    if (column in df[0]) {
      return df.reduce((total, row) => {
        const parsed = Number(row[column]);
        return total + (Number.isNaN(parsed) ? 0 : parsed);
      }, 0);
    }
  }
  return defaultValue;
}

export function getBreakEvenYear(navDf: Row[]): number | null {
  const navCandidates = ["Local Currency NAV", "NAV", "Net Asset Value", "Final NAV Local"];

  if (!navDf || navDf.length === 0 || !("Year" in navDf[0])) return null;

  const navColumn = navCandidates.find((candidate) => candidate in navDf[0]);
  if (navColumn === undefined) return null;

  const breakEvenRow = navDf.find((row) => Number(row[navColumn]) >= 0);
  if (breakEvenRow === undefined) return null;

  return Math.trunc(Number(breakEvenRow["Year"]));
}

/**
 * Simple cross-country risk score; higher = more dangerous.
 * ponytail: heuristic score from the Python app, kept identical for parity.
 */
export function calculateRiskScore(
  navDf: Row[],
  incomeDf: Row[],
  finalNavLocal: number,
  highestDebt: number
): number {
  if (!navDf || navDf.length === 0) return 100.0;

  const navColumn = ["Local Currency NAV", "NAV", "Net Asset Value"].find(
    (candidate) => candidate in navDf[0]
  );
  if (navColumn === undefined) return 100.0;

  const safeNav = navDf.map((row) => {
    const parsed = Number(row[navColumn]);
    return Number.isNaN(parsed) ? 0.0 : parsed;
  });

  const negativeNavYears = safeNav.filter((value) => value < 0).length;
  const horizon = Math.max(safeNav.length, 1);

  const negativeNavComponent = Math.min(30.0, (negativeNavYears / horizon) * 30.0);
  const breakEvenComponent = getBreakEvenYear(navDf) !== null ? 0.0 : 25.0;

  const totalNetIncome = safeSumFromCandidates(incomeDf, ["Net Income", "Total Net Income"], 0.0);

  const debtRatio = highestDebt / Math.max(Math.abs(totalNetIncome), 1.0);
  const debtComponent = Math.min(25.0, debtRatio * 100.0);

  const finalNavComponent = finalNavLocal < 0 ? 20.0 : 0.0;

  return pyround(
    Math.min(
      100.0,
      negativeNavComponent + breakEvenComponent + debtComponent + finalNavComponent
    ),
    2
  );
}

export interface CountryDataset {
  name: string;
  currency?: string;
  dataset: Dataset;
}

/**
 * Compare the same selected scenario across all registered countries.
 * Datasets are passed in (bundled JSON), replacing Python's file loading.
 */
export function buildCountryComparison(
  countryDatasets: CountryDataset[],
  migrationPathLabel: string,
  lifeScenarioLabel: string,
  inputs: ComparisonInputs
): Row[] {
  const records: Row[] = [];

  for (const { name: countryName, currency: registryCurrency, dataset } of countryDatasets) {
    try {
      // Python validates on load_dataset; invalid datasets land in the
      // Failed rows (e.g. Singapore's currency mismatch).
      validateDataset(dataset);

      const country = getDatasetCountry(dataset);
      const currency = getDatasetCurrency(dataset);
      const exchangeRate = getExchangeRateFromDataset(dataset);

      const scenarioInputs: ScenarioInputs = {
        ...inputs,
        migration_path_label: migrationPathLabel,
        life_scenario_label: lifeScenarioLabel,
      };

      const scenarioConfig = buildScenarioConfig(dataset, scenarioInputs);

      const incomeDf = calculateYearlyIncome(dataset, scenarioConfig);
      const expenseDf = calculateYearlyExpenses(dataset, scenarioConfig);
      const navDf = calculateNavSimulation(dataset, scenarioConfig, incomeDf, expenseDf);
      const navSummary = getNavSummary(navDf);

      const finalNavLocal = getFinalNavFromSummary(navSummary);
      const finalNavLkr = finalNavLocal * exchangeRate;
      const breakEvenYear = getBreakEvenYear(navDf);

      const lowestNav = safeMinFromCandidates(navDf, [
        "Local Currency NAV",
        "NAV",
        "Net Asset Value",
      ]);

      const highestDebt = safeMaxFromCandidates(navDf, [
        "Total Debt",
        "Total Liabilities",
        "Local Currency Liabilities",
        "Liabilities",
      ]);

      const totalTuition = safeSumFromCandidates(expenseDf, [
        "Tuition",
        "Tuition Cost",
        "Education Cost",
      ]);
      const totalRent = safeSumFromCandidates(expenseDf, ["Rent", "Housing", "Accommodation"]);
      const totalTax = safeSumFromCandidates(incomeDf, ["Tax", "Income Tax", "Tax Paid"]);

      const riskScore = calculateRiskScore(navDf, incomeDf, finalNavLocal, highestDebt);

      records.push({
        Country: country,
        Currency: currency,
        Scenario: `${migrationPathLabel} + ${lifeScenarioLabel}`,
        "Final NAV Local": pyround(finalNavLocal, 2),
        [`Final NAV ${currency}`]: pyround(finalNavLocal, 2),
        "Final NAV LKR": pyround(finalNavLkr, 2),
        "Break-even Year": breakEvenYear !== null ? breakEvenYear : "No break-even",
        "Lowest NAV": pyround(lowestNav, 2),
        "Highest Debt": pyround(highestDebt, 2),
        "Total Tuition": pyround(totalTuition, 2),
        "Total Rent": pyround(totalRent, 2),
        "Total Tax": pyround(totalTax, 2),
        "Risk Score": riskScore,
        "Exchange Rate to LKR": exchangeRate,
        Status: "OK",
        Error: "",
      });
    } catch (error) {
      records.push({
        Country: countryName,
        Currency: registryCurrency ?? "N/A",
        Scenario: `${migrationPathLabel} + ${lifeScenarioLabel}`,
        "Final NAV Local": null,
        "Final NAV LKR": null,
        "Break-even Year": null,
        "Lowest NAV": null,
        "Highest Debt": null,
        "Total Tuition": null,
        "Total Rent": null,
        "Total Tax": null,
        "Risk Score": 100.0,
        "Exchange Rate to LKR": null,
        Status: "Failed",
        // Python's str(error) has no "Error: " prefix.
        Error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (records.length === 0) return records;

  const successful = records
    .filter((row) => row["Status"] === "OK")
    .sort((a, b) => Number(b["Final NAV LKR"]) - Number(a["Final NAV LKR"]));

  successful.forEach((row, index) => {
    row["Country Rank"] = index + 1;
  });

  const failed = records.filter((row) => row["Status"] !== "OK");
  failed.forEach((row) => {
    row["Country Rank"] = null;
  });

  return [...successful, ...failed];
}
