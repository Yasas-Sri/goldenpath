import { Dataset, Row, ScenarioConfig, getNestedValue } from "./dataset";
import {
  buildScenarioConfig,
  MIGRATION_PATH_OPTIONS,
  LIFE_SCENARIO_OPTIONS,
  ScenarioInputs,
} from "./scenarioBuilder";
import { calculateYearlyIncome } from "./incomeModel";
import { calculateYearlyExpenses } from "./expenseModel";
import { calculateNavSimulation, getNavSummary } from "./navModel";
import { pyround } from "./pyround";

export function getDatasetCountry(dataset: Dataset): string {
  const metadata = dataset["metadata"] ?? {};
  return String(
    metadata["country"] || metadata["country_name"] || dataset["country"] || "Selected Country"
  );
}

export function getDatasetCurrency(dataset: Dataset): string {
  const metadata = dataset["metadata"] ?? {};
  return String(metadata["currency"] || dataset["currency"] || "LOCAL").toUpperCase();
}

function extractNumericValue(value: any): number | null {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    value = value["value"];
  }
  const parsed = Number(value);
  return value == null || Number.isNaN(parsed) ? null : parsed;
}

function searchExchangeRateRecursively(data: any): number | null {
  if (data != null && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const keyText = String(key).toLowerCase();

      if (keyText.includes("to_lkr") && keyText.includes("exchange")) {
        const numericValue = extractNumericValue(value);
        if (numericValue !== null) return numericValue;
      }

      if (keyText.includes("lkr_exchange_rate")) {
        const numericValue = extractNumericValue(value);
        if (numericValue !== null) return numericValue;
      }

      const nestedValue = searchExchangeRateRecursively(value);
      if (nestedValue !== null) return nestedValue;
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const nestedValue = searchExchangeRateRecursively(item);
      if (nestedValue !== null) return nestedValue;
    }
  }

  return null;
}

/** Falls back to 1.0 so comparison never crashes. */
export function getExchangeRateFromDataset(dataset: Dataset): number {
  const currency = getDatasetCurrency(dataset).toLowerCase();

  const directPaths = [
    `investment_and_economy.${currency}_to_lkr_exchange_rate.value`,
    `investment_and_economy.${currency}_to_lkr.value`,
    "investment_and_economy.exchange_rate_to_lkr.value",
    "investment_and_economy.local_to_lkr_exchange_rate.value",
    "metadata.exchange_rate_to_lkr",
  ];

  for (const path of directPaths) {
    const numericValue = extractNumericValue(getNestedValue(dataset, path, null));
    if (numericValue !== null) return numericValue;
  }

  const recursiveValue = searchExchangeRateRecursively(dataset);
  if (recursiveValue !== null) return recursiveValue;

  return 1.0;
}

export interface SimulationResult {
  income_df: Row[];
  expense_df: Row[];
  nav_df: Row[];
  nav_summary: Record<string, any>;
}

export function runSingleNavSimulation(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig
): SimulationResult {
  const incomeDf = calculateYearlyIncome(dataset, scenarioConfig);
  const expenseDf = calculateYearlyExpenses(dataset, scenarioConfig);
  const navDf = calculateNavSimulation(dataset, scenarioConfig, incomeDf, expenseDf);
  const navSummary = getNavSummary(navDf);

  return {
    income_df: incomeDf,
    expense_df: expenseDf,
    nav_df: navDf,
    nav_summary: navSummary,
  };
}

export function getFinalNavFromSummary(navSummary: Record<string, any>): number {
  const possibleKeys = [
    "year_10_nav",
    "final_nav",
    "final_year_10_nav",
    "Final NAV",
    "Year-10 NAV",
    "Year-10 NAV Local",
    "Final NAV Local",
  ];

  for (const key of possibleKeys) {
    if (key in navSummary) {
      const parsed = Number(navSummary[key]);
      return Number.isNaN(parsed) ? 0.0 : parsed;
    }
  }

  return 0.0;
}

function safeLastValueFromCandidates(df: Row[], candidates: string[], defaultValue = 0.0): number {
  if (!df || df.length === 0) return defaultValue;

  for (const columnName of candidates) {
    if (columnName in df[0]) {
      const parsed = Number(df[df.length - 1][columnName]);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    }
  }

  return defaultValue;
}

function safeSumFromCandidates(df: Row[], candidates: string[]): number {
  if (!df || df.length === 0) return 0.0;

  for (const columnName of candidates) {
    if (columnName in df[0]) {
      return df.reduce((total, row) => total + Number(row[columnName] ?? 0), 0);
    }
  }

  return 0.0;
}

/** Prevent advanced child timing from turning child-free scenarios into child scenarios. */
export function resolveChildTimingForLifeScenario(
  lifeScenarioLabel: string,
  firstChildTimingLabel: string | null,
  secondChildTimingLabel: string | null
): { first_child_timing_label: string | null; second_child_timing_label: string | null } {
  const normalizedLabel = lifeScenarioLabel.toLowerCase();

  const hasOneChild = normalizedLabel.includes("one child") || normalizedLabel.includes("1 child");
  const hasTwoChildren =
    normalizedLabel.includes("two children") || normalizedLabel.includes("2 children");

  if (!hasOneChild && !hasTwoChildren) {
    return {
      first_child_timing_label: "No child",
      second_child_timing_label: "No second child",
    };
  }

  if (hasOneChild && !hasTwoChildren) {
    return {
      first_child_timing_label: firstChildTimingLabel,
      second_child_timing_label: "No second child",
    };
  }

  return {
    first_child_timing_label: firstChildTimingLabel,
    second_child_timing_label: secondChildTimingLabel,
  };
}

export type ComparisonInputs = Omit<ScenarioInputs, "migration_path_label" | "life_scenario_label">;

export function buildScenarioComparison(dataset: Dataset, inputs: ComparisonInputs): Row[] {
  const country = getDatasetCountry(dataset);
  const currency = getDatasetCurrency(dataset);
  const migrationPathLabels = Object.keys(MIGRATION_PATH_OPTIONS);
  const lifeScenarioLabels = Object.keys(LIFE_SCENARIO_OPTIONS);
  const exchangeRate = getExchangeRateFromDataset(dataset);

  const records: Row[] = [];

  for (const migrationPathLabel of migrationPathLabels) {
    for (const lifeScenarioLabel of lifeScenarioLabels) {
      const childTiming = resolveChildTimingForLifeScenario(
        lifeScenarioLabel,
        inputs.first_child_timing_label ?? null,
        inputs.second_child_timing_label ?? null
      );

      // Python only forwards optional labels when they are not None.
      const scenarioInputs: ScenarioInputs = {
        ...inputs,
        migration_path_label: migrationPathLabel,
        life_scenario_label: lifeScenarioLabel,
        first_child_timing_label: childTiming.first_child_timing_label,
        second_child_timing_label: childTiming.second_child_timing_label,
      };

      const scenarioConfig = buildScenarioConfig(dataset, scenarioInputs);
      const result = runSingleNavSimulation(dataset, scenarioConfig);

      const finalNavLocal = getFinalNavFromSummary(result.nav_summary);
      const finalNavLkr = finalNavLocal * exchangeRate;
      const scenarioName = `${migrationPathLabel} + ${lifeScenarioLabel}`;

      records.push({
        Country: country,
        Currency: currency,
        Scenario: scenarioName,
        "Migration Path": migrationPathLabel,
        "Life Scenario": lifeScenarioLabel,
        "Year-10 NAV Local": pyround(finalNavLocal, 2),
        [`Year-10 NAV ${currency}`]: pyround(finalNavLocal, 2),
        "Final NAV Local": pyround(finalNavLocal, 2),
        [`Final NAV ${currency}`]: pyround(finalNavLocal, 2),
        "Final NAV": pyround(finalNavLocal, 2),
        "Year-10 NAV LKR": pyround(finalNavLkr, 2),
        "Final NAV LKR": pyround(finalNavLkr, 2),
        "Final Cash Local": pyround(
          safeLastValueFromCandidates(result.nav_df, ["Cash Balance", "Cash Savings", "Cash"]),
          2
        ),
        "Final Investment Local": pyround(
          safeLastValueFromCandidates(result.nav_df, ["Investment Balance", "Investments"]),
          2
        ),
        "Final Retirement Local": pyround(
          safeLastValueFromCandidates(result.nav_df, [
            "Superannuation Balance",
            "Superannuation",
            "Retirement Balance",
          ]),
          2
        ),
        "Final Total Assets Local": pyround(
          safeLastValueFromCandidates(result.nav_df, ["Total Assets", "Local Currency Assets"]),
          2
        ),
        "Final Total Liabilities Local": pyround(
          safeLastValueFromCandidates(result.nav_df, [
            "Total Liabilities",
            "Local Currency Liabilities",
            "Total Debt",
          ]),
          2
        ),
        "Total Income Local": pyround(
          safeSumFromCandidates(result.income_df, ["Net Income", "Total Net Income"]),
          2
        ),
        "Total Expenses Local": pyround(
          safeSumFromCandidates(result.expense_df, ["Total Expenses", "Total Expense"]),
          2
        ),
      });
    }
  }

  if (records.length === 0) return records;
  return rankScenariosByNav(records);
}

function getNavColumn(comparisonDf: Row[]): string {
  const possibleColumns = ["Year-10 NAV Local", "Final NAV Local", "Final NAV", "Year-10 NAV", "NAV"];

  for (const columnName of possibleColumns) {
    if (comparisonDf.length > 0 && columnName in comparisonDf[0]) return columnName;
  }

  throw new Error("No NAV column found in comparison_df.");
}

export function rankScenariosByNav(comparisonDf: Row[]): Row[] {
  if (comparisonDf.length === 0) return [...comparisonDf];

  const navColumn = getNavColumn(comparisonDf);
  const ranked = comparisonDf
    .map((row) => ({ ...row }))
    .sort((a, b) => Number(b[navColumn]) - Number(a[navColumn]));

  ranked.forEach((row, index) => {
    row["Rank"] = index + 1;
    row["Scenario Rank"] = row["Rank"];
  });

  return ranked;
}

export function getBestScenario(comparisonDf: Row[]): Row {
  if (comparisonDf.length === 0) return {};
  return rankScenariosByNav(comparisonDf)[0];
}

export function getWorstScenario(comparisonDf: Row[]): Row {
  if (comparisonDf.length === 0) return {};
  const ranked = rankScenariosByNav(comparisonDf);
  return ranked[ranked.length - 1];
}

export function calculateNavGap(
  selectedScenario: Row,
  bestScenario: Row,
  navColumn = "Year-10 NAV Local"
): number {
  if (Object.keys(selectedScenario).length === 0 || Object.keys(bestScenario).length === 0) {
    return 0.0;
  }

  const readNav = (scenario: Row) =>
    Number(
      scenario[navColumn] ?? scenario["Final NAV Local"] ?? scenario["Final NAV"] ?? 0.0
    );

  return pyround(readNav(bestScenario) - readNav(selectedScenario), 2);
}

export function compareSelectedVsBest(
  comparisonDf: Row[],
  selectedMigrationPathLabel: string,
  selectedLifeScenarioLabel: string
): Record<string, any> {
  if (comparisonDf.length === 0) {
    return {
      selected_scenario: {},
      best_scenario: {},
      worst_scenario: {},
      selected_rank: null,
      total_scenarios: 0,
      nav_gap_local: 0.0,
      nav_gap_lkr: 0.0,
      nav_gap_aud: 0.0,
      message: "No scenario comparison results are available.",
    };
  }

  const rankedDf = rankScenariosByNav(comparisonDf);
  const navColumn = getNavColumn(rankedDf);

  const selectedRow = rankedDf.find(
    (row) =>
      row["Migration Path"] === selectedMigrationPathLabel &&
      row["Life Scenario"] === selectedLifeScenarioLabel
  );

  const selectedScenario: Row = selectedRow ?? {};
  const selectedRank = selectedRow ? Math.trunc(Number(selectedRow["Rank"])) : null;

  const bestScenario = getBestScenario(rankedDf);
  const worstScenario = getWorstScenario(rankedDf);

  const currency = selectedScenario["Currency"] || bestScenario["Currency"] || "LOCAL";

  const navGapLocal = calculateNavGap(selectedScenario, bestScenario, navColumn);

  const selectedLkr = selectedRow
    ? Number(selectedScenario["Year-10 NAV LKR"] ?? selectedScenario["Final NAV LKR"] ?? 0.0)
    : 0.0;
  const bestLkr =
    Object.keys(bestScenario).length > 0
      ? Number(bestScenario["Year-10 NAV LKR"] ?? bestScenario["Final NAV LKR"] ?? 0.0)
      : 0.0;

  const navGapLkr = pyround(bestLkr - selectedLkr, 2);
  const totalScenarios = rankedDf.length;

  let message: string;

  if (selectedRank === null) {
    message = "The selected scenario was not found in the comparison table.";
  } else if (navGapLocal <= 0) {
    message =
      `Your selected scenario ranks ${selectedRank} out of ${totalScenarios}. ` +
      "It is currently the best scenario by Year-10 NAV.";
  } else {
    // pyround first: Python's f"{x:,.0f}" rounds half-to-even.
    const gapText = pyround(navGapLocal, 0).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
    message =
      `Your selected scenario ranks ${selectedRank} out of ${totalScenarios}. ` +
      `It is ${currency} ${gapText} below the best scenario.`;
  }

  return {
    selected_scenario: selectedScenario,
    best_scenario: bestScenario,
    worst_scenario: worstScenario,
    selected_rank: selectedRank,
    total_scenarios: totalScenarios,
    nav_gap_local: navGapLocal,
    nav_gap_lkr: navGapLkr,
    nav_gap_aud: navGapLocal,
    currency,
    message,
  };
}
