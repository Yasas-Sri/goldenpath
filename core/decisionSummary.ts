import { Row } from "./dataset";

function normalizeText(value: any): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, "")
    .replace(/-/g, "")
    .replace(/ /g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\//g, "");
}

function findColumn(df: Row[] | null, candidateNames: string[]): string | null {
  if (!df || df.length === 0) return null;

  const normalizedCandidates = new Set(candidateNames.map(normalizeText));

  for (const column of Object.keys(df[0])) {
    if (normalizedCandidates.has(normalizeText(column))) return column;
  }

  return null;
}

/** Numeric like pandas: at least one number, all non-null values numbers. */
function isNumericColumn(df: Row[], column: string): boolean {
  let hasNumber = false;
  for (const row of df) {
    const value = row[column];
    if (value == null) continue;
    if (typeof value === "number") {
      hasNumber = true;
    } else if (typeof value !== "boolean") {
      return false;
    }
  }
  return hasNumber;
}

function safeFloat(value: any, defaultValue = 0.0): number {
  const parsed = Number(value);
  return value == null || Number.isNaN(parsed) ? defaultValue : parsed;
}

function safeSumColumn(df: Row[] | null, candidateNames: string[]): number {
  const column = findColumn(df, candidateNames);
  if (column === null || !df) return 0.0;

  return df.reduce((total, row) => total + safeFloat(row[column]), 0);
}

function safeSumMatchingColumns(
  df: Row[] | null,
  includeTerms: string[],
  excludeTerms: string[] = []
): number {
  if (!df || df.length === 0) return 0.0;

  let total = 0.0;

  for (const column of Object.keys(df[0])) {
    const normalizedColumn = normalizeText(column);

    const hasIncludeTerm = includeTerms.some((term) =>
      normalizedColumn.includes(normalizeText(term))
    );
    const hasExcludeTerm = excludeTerms.some((term) =>
      normalizedColumn.includes(normalizeText(term))
    );

    if (hasIncludeTerm && !hasExcludeTerm && isNumericColumn(df, column)) {
      total += df.reduce((sum, row) => sum + safeFloat(row[column]), 0);
    }
  }

  return total;
}

function calculateCategoryTotal(
  df: Row[] | null,
  exactCandidates: string[],
  fallbackTerms: string[],
  excludeTerms: string[] = []
): number {
  const exactTotal = safeSumColumn(df, exactCandidates);
  if (exactTotal > 0) return exactTotal;
  return safeSumMatchingColumns(df, fallbackTerms, excludeTerms);
}

function cleanVariableName(value: any): string {
  if (value == null) return "Unavailable";

  const rawValue = String(value).trim();

  const variableMap: Record<string, string> = {
    "salary growth rate": "Salary Growth",
    "salary growth": "Salary Growth",
    "rent multiplier": "Rent",
    rent: "Rent",
    "inflation rate": "Inflation",
    inflation: "Inflation",
    "investment return rate": "Investment Return",
    "investment return": "Investment Return",
    "tuition multiplier": "Tuition",
    tuition: "Tuition",
    "childcare multiplier": "Childcare",
    childcare: "Childcare",
    "spouse income": "Spouse Income",
    "exchange rate": "Exchange Rate",
  };

  const normalizedRaw = rawValue.toLowerCase().replace(/_/g, " ").trim();
  if (normalizedRaw in variableMap) return variableMap[normalizedRaw];

  return rawValue
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function getNavColumn(navDf: Row[]): string | null {
  return findColumn(navDf, [
    "Local Currency NAV",
    "NAV",
    "Final NAV",
    "Year-10 NAV Local",
    "Year 10 NAV Local",
    "Year-10 NAV",
  ]);
}

function getDebtColumn(navDf: Row[]): string | null {
  return findColumn(navDf, [
    "Local Currency Debt",
    "Total Debt",
    "Debt",
    "Total Liabilities",
    "Local Currency Liabilities",
    "Negative Cash Debt",
  ]);
}

function getBreakEvenYear(navDf: Row[]): number | null {
  if (!navDf || navDf.length === 0) return null;

  const navColumn = getNavColumn(navDf);
  if (navColumn === null) return null;

  const breakEvenRow = navDf.find((row) => safeFloat(row[navColumn]) >= 0);
  if (breakEvenRow === undefined) return null;

  return Math.trunc(Number(breakEvenRow["Year"]));
}

function getHighestDebt(navDf: Row[]): [number, number | null] {
  if (!navDf || navDf.length === 0) return [0.0, null];

  const debtColumn = getDebtColumn(navDf);
  if (debtColumn === null) return [0.0, null];

  const highestDebtRow = navDf.reduce((best, row) =>
    safeFloat(row[debtColumn]) > safeFloat(best[debtColumn]) ? row : best
  );

  return [Number(highestDebtRow[debtColumn]), Math.trunc(Number(highestDebtRow["Year"]))];
}

function getLowestNav(navDf: Row[]): [number, number | null] {
  if (!navDf || navDf.length === 0) return [0.0, null];

  const navColumn = getNavColumn(navDf);
  if (navColumn === null) return [0.0, null];

  const lowestNavRow = navDf.reduce((best, row) =>
    safeFloat(row[navColumn]) < safeFloat(best[navColumn]) ? row : best
  );

  return [Number(lowestNavRow[navColumn]), Math.trunc(Number(lowestNavRow["Year"]))];
}

function getBestScenarioInfo(
  comparisonDf: Row[] | null,
  selectedFinalNav: number
): [string, number, number, number] {
  if (!comparisonDf || comparisonDf.length === 0) {
    return ["Unavailable", selectedFinalNav, 0.0, 0.0];
  }

  const scenarioColumn = findColumn(comparisonDf, [
    "Scenario",
    "Scenario Name",
    "Name",
    "Case",
    "Configuration",
    "Scenario Type",
  ]);

  let finalNavColumn = findColumn(comparisonDf, [
    "Year-10 NAV Local",
    "Year 10 NAV Local",
    "Final NAV Local",
    "Local Currency NAV",
    "Final NAV",
    "Year 10 NAV",
    "Year-10 NAV",
    "NAV",
    "Year 10 NAV AUD",
    "Year 10 NAV (AUD)",
  ]);

  if (finalNavColumn === null) {
    const numericColumns = Object.keys(comparisonDf[0]).filter((column) =>
      isNumericColumn(comparisonDf, column)
    );
    if (numericColumns.length === 0) return ["Unavailable", selectedFinalNav, 0.0, 0.0];
    finalNavColumn = numericColumns[numericColumns.length - 1];
  }

  const validRows = comparisonDf.filter((row) => {
    const parsed = Number(row[finalNavColumn!]);
    return row[finalNavColumn!] != null && !Number.isNaN(parsed);
  });

  if (validRows.length === 0) return ["Unavailable", selectedFinalNav, 0.0, 0.0];

  const bestRow = validRows.reduce((best, row) =>
    Number(row[finalNavColumn!]) > Number(best[finalNavColumn!]) ? row : best
  );

  const bestScenarioName =
    scenarioColumn !== null ? String(bestRow[scenarioColumn]) : "Best Available Scenario";

  const bestFinalNav = Number(bestRow[finalNavColumn]);

  return [
    bestScenarioName,
    bestFinalNav,
    bestFinalNav - selectedFinalNav,
    selectedFinalNav - bestFinalNav,
  ];
}

function getMainRiskVariableFromTornado(tornadoDf: Row[] | null): string {
  if (!tornadoDf || tornadoDf.length === 0) return "Unavailable";

  let variableColumn = findColumn(tornadoDf, [
    "Variable",
    "Risk Variable",
    "Input",
    "Parameter",
    "Factor",
    "Assumption",
  ]);

  if (variableColumn === null) {
    const objectColumns = Object.keys(tornadoDf[0]).filter(
      (column) => !isNumericColumn(tornadoDf, column)
    );
    if (objectColumns.length === 0) return "Unavailable";
    variableColumn = objectColumns[0];
  }

  const impactColumn = findColumn(tornadoDf, [
    "Max Impact %",
    "Max Impact LKR",
    "Max Impact Local",
    "Impact",
    "NAV Impact",
    "Absolute Impact",
    "Range",
    "NAV Range",
    "Difference",
    "Final NAV Difference",
  ]);

  if (impactColumn !== null) {
    const validRows = tornadoDf.filter((row) => {
      const parsed = Number(row[impactColumn]);
      return row[impactColumn] != null && !Number.isNaN(parsed);
    });

    if (validRows.length === 0) return "Unavailable";

    const mainRow = validRows.reduce((best, row) =>
      Math.abs(Number(row[impactColumn])) > Math.abs(Number(best[impactColumn])) ? row : best
    );

    return cleanVariableName(mainRow[variableColumn]);
  }

  // Fallback (numeric range across columns) is unreachable with our tornado
  // output, which always includes "Max Impact %".
  return "Unavailable";
}

function getMainRiskVariableFromSensitivity(sensitivityDf: Row[] | null): string {
  if (!sensitivityDf || sensitivityDf.length === 0) return "Unavailable";

  const variableColumn = findColumn(sensitivityDf, [
    "Variable",
    "Risk Variable",
    "Input",
    "Parameter",
    "Factor",
    "Assumption",
  ]);

  const finalNavColumn = findColumn(sensitivityDf, [
    "Year-10 NAV Local",
    "Year 10 NAV Local",
    "Final NAV Local",
    "Local Currency NAV",
    "Final NAV",
    "Year 10 NAV",
    "Year-10 NAV",
    "NAV",
    "Year 10 NAV AUD",
    "Year 10 NAV (AUD)",
  ]);

  if (variableColumn === null || finalNavColumn === null) return "Unavailable";

  const ranges = new Map<string, { min: number; max: number }>();

  for (const row of sensitivityDf) {
    const parsed = Number(row[finalNavColumn]);
    if (row[finalNavColumn] == null || Number.isNaN(parsed)) continue;

    const key = String(row[variableColumn]);
    const current = ranges.get(key);

    if (current === undefined) {
      ranges.set(key, { min: parsed, max: parsed });
    } else {
      current.min = Math.min(current.min, parsed);
      current.max = Math.max(current.max, parsed);
    }
  }

  if (ranges.size === 0) return "Unavailable";

  // pandas groupby sorts group keys; idxmax takes the first max in key order.
  const sortedKeys = [...ranges.keys()].sort();
  let mainVariable = sortedKeys[0];
  let mainRange = -Infinity;

  for (const key of sortedKeys) {
    const { min, max } = ranges.get(key)!;
    const range = Math.abs(max - min);
    if (range > mainRange) {
      mainRange = range;
      mainVariable = key;
    }
  }

  return cleanVariableName(mainVariable);
}

function getMainRiskVariable(sensitivityDf: Row[] | null, tornadoDf: Row[] | null): string {
  const tornadoRisk = getMainRiskVariableFromTornado(tornadoDf);
  if (tornadoRisk !== "Unavailable") return tornadoRisk;
  return getMainRiskVariableFromSensitivity(sensitivityDf);
}

function getMainExpenseCategory(categoryTotals: Record<string, number>): [string, number] {
  const positiveEntries = Object.entries(categoryTotals).filter(([, amount]) => amount > 0);

  if (positiveEntries.length === 0) return ["Unavailable", 0.0];

  const [mainCategory, mainAmount] = positiveEntries.reduce((best, entry) =>
    entry[1] > best[1] ? entry : best
  );

  return [mainCategory, mainAmount];
}

export function buildDecisionSentence(decisionSummary: Record<string, any>): string {
  const breakEvenYear = decisionSummary["break_even_year"];
  const mainExpenseCategory = decisionSummary["main_expense_category"] ?? "Unavailable";
  const mainRiskVariable = decisionSummary["main_risk_variable"] ?? "Unavailable";

  const breakEvenText =
    breakEvenYear == null
      ? "This scenario does not become positive within the 10-year period."
      : `This scenario becomes positive in Year ${breakEvenYear}.`;

  return (
    `${breakEvenText} ` +
    `The biggest cost is ${mainExpenseCategory}. ` +
    `The biggest risk is ${mainRiskVariable}.`
  );
}

export function buildDecisionSummary(
  incomeDf: Row[],
  expenseDf: Row[],
  navDf: Row[],
  comparisonDf: Row[] | null,
  sensitivityDf: Row[] | null,
  tornadoDf: Row[] | null,
  exchangeRate: number,
  localCurrency = "LOCAL"
): Record<string, any> {
  const finalRow = navDf[navDf.length - 1];
  const navColumn = "Local Currency NAV" in finalRow ? "Local Currency NAV" : "NAV";

  const finalYear10Nav = Number(finalRow[navColumn]);
  const finalNavLkr =
    "LKR NAV" in finalRow ? Number(finalRow["LKR NAV"]) : finalYear10Nav * Number(exchangeRate);

  const breakEvenYear = getBreakEvenYear(navDf);

  const [highestDebtAmount, highestDebtYear] = getHighestDebt(navDf);
  const [lowestNavAmount, lowestNavYear] = getLowestNav(navDf);

  const excludeRateTerms = ["rate", "multiplier", "percentage"];

  const totalRentPaid = calculateCategoryTotal(
    expenseDf,
    ["Rent", "Housing Rent", "Annual Rent", "Accommodation", "Accommodation Cost"],
    ["rent", "accommodation", "housing"],
    excludeRateTerms
  );

  const totalTuitionPaid = calculateCategoryTotal(
    expenseDf,
    ["Tuition", "Tuition Fee", "Tuition Fees", "Education Cost", "Study Cost"],
    ["tuition", "education", "study"],
    excludeRateTerms
  );

  const totalChildcarePaid = calculateCategoryTotal(
    expenseDf,
    ["Childcare", "Childcare Cost", "Child Care", "Child Care Cost"],
    ["childcare", "child care"],
    excludeRateTerms
  );

  const totalCarCost = calculateCategoryTotal(
    expenseDf,
    [
      "Car Cost",
      "Total Car Cost",
      "Car Expenses",
      "Vehicle Cost",
      "Vehicle Expenses",
      "Car Loan Payment",
    ],
    ["car", "vehicle", "fuel", "maintenance", "insurance", "registration"],
    [
      "car value",
      "vehicle value",
      "resale value",
      "asset value",
      "rate",
      "multiplier",
      "percentage",
    ]
  );

  const totalTaxPaid = calculateCategoryTotal(
    incomeDf,
    ["Tax", "Tax Paid", "Income Tax", "Total Tax"],
    ["tax"],
    ["rate", "percentage"]
  );

  const totalSuperannuation = calculateCategoryTotal(
    incomeDf,
    ["Superannuation", "Super", "Employer Superannuation", "Retirement Contribution"],
    ["superannuation", "super", "retirement"],
    ["rate", "percentage"]
  );

  const categoryTotals: Record<string, number> = {
    Rent: totalRentPaid,
    Tuition: totalTuitionPaid,
    Childcare: totalChildcarePaid,
    "Car Cost": totalCarCost,
    Tax: totalTaxPaid,
  };

  const [mainExpenseCategory, mainExpenseAmount] = getMainExpenseCategory(categoryTotals);
  const mainRiskVariable = getMainRiskVariable(sensitivityDf, tornadoDf);

  const [bestScenarioName, bestScenarioFinalNav, bestScenarioGap, selectedVsBestDifference] =
    getBestScenarioInfo(comparisonDf, finalYear10Nav);

  const decisionSummary: Record<string, any> = {
    local_currency: localCurrency,
    exchange_rate_to_lkr: exchangeRate,

    final_year_10_nav_local: finalYear10Nav,
    final_year_10_nav_lkr: finalNavLkr,

    final_year_10_nav: finalYear10Nav,
    final_nav_lkr: finalNavLkr,

    break_even_year: breakEvenYear,

    highest_debt_year: highestDebtYear,
    highest_debt_amount: highestDebtAmount,

    lowest_nav_year: lowestNavYear,
    lowest_nav_amount: lowestNavAmount,

    total_rent_paid: totalRentPaid,
    total_tuition_paid: totalTuitionPaid,
    total_childcare_paid: totalChildcarePaid,
    total_car_cost: totalCarCost,
    total_tax_paid: totalTaxPaid,
    total_superannuation: totalSuperannuation,

    expense_category_totals: categoryTotals,
    main_expense_category: mainExpenseCategory,
    main_expense_amount: mainExpenseAmount,

    main_risk_variable: mainRiskVariable,

    best_scenario_name: bestScenarioName,
    best_scenario_final_nav: bestScenarioFinalNav,
    best_scenario_gap: bestScenarioGap,
    selected_vs_best_difference: selectedVsBestDifference,
  };

  decisionSummary["decision_sentence"] = buildDecisionSentence(decisionSummary);

  return decisionSummary;
}
