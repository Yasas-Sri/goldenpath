import { Row } from "./dataset";
import { pyround } from "./pyround";

// The Python risk model reads hardcoded "... NAV AUD" columns, which only
// exist when the country's local currency is AUD. For every other country it
// silently falls back to zeros. Replicated as-is for result parity with the
// Streamlit app — do not "fix" without changing the Python side too.

function safeFloat(value: any, defaultValue = 0.0): number {
  const parsed = Number(value);
  return value == null || Number.isNaN(parsed) ? defaultValue : parsed;
}

function findColumn(df: Row[], possibleColumns: string[]): string | null {
  if (df.length === 0) return null;
  for (const columnName of possibleColumns) {
    if (columnName in df[0]) return columnName;
  }
  return null;
}

export function getMostSensitiveVariable(tornadoDf: Row[]): Record<string, any> {
  const empty = {
    variable: null,
    max_impact_aud: 0.0,
    max_impact_lkr: 0.0,
    max_impact_percent: 0.0,
  };

  if (tornadoDf.length === 0) return empty;

  const impactColumn = findColumn(tornadoDf, ["Max Impact %", "Max Impact AUD", "Max Impact LKR"]);
  if (impactColumn === null) return empty;

  const row = [...tornadoDf].sort(
    (a, b) => Math.abs(Number(b[impactColumn])) - Math.abs(Number(a[impactColumn]))
  )[0];

  return {
    variable: row["Variable"] ?? null,
    max_impact_aud: safeFloat(row["Max Impact AUD"]),
    max_impact_lkr: safeFloat(row["Max Impact LKR"]),
    max_impact_percent: safeFloat(row["Max Impact %"]),
  };
}

const EMPTY_CASE = {
  variable: null,
  change_label: null,
  nav_aud: 0.0,
  nav_lkr: 0.0,
  delta_aud: 0.0,
  delta_lkr: 0.0,
};

export function getBestCaseNav(sensitivityDf: Row[]): Record<string, any> {
  if (sensitivityDf.length === 0 || !("Year-10 NAV AUD" in sensitivityDf[0])) {
    return { ...EMPTY_CASE };
  }

  const row = [...sensitivityDf].sort(
    (a, b) => Number(b["Year-10 NAV AUD"]) - Number(a["Year-10 NAV AUD"])
  )[0];

  return {
    variable: row["Variable"] ?? null,
    change_label: row["Change Label"] ?? null,
    nav_aud: safeFloat(row["Year-10 NAV AUD"]),
    nav_lkr: safeFloat(row["Year-10 NAV LKR"]),
    delta_aud: safeFloat(row["Delta NAV AUD"]),
    delta_lkr: safeFloat(row["Delta NAV LKR"]),
  };
}

export function getWorstCaseNav(sensitivityDf: Row[]): Record<string, any> {
  if (sensitivityDf.length === 0 || !("Year-10 NAV AUD" in sensitivityDf[0])) {
    return { ...EMPTY_CASE };
  }

  const row = [...sensitivityDf].sort(
    (a, b) => Number(a["Year-10 NAV AUD"]) - Number(b["Year-10 NAV AUD"])
  )[0];

  return {
    variable: row["Variable"] ?? null,
    change_label: row["Change Label"] ?? null,
    nav_aud: safeFloat(row["Year-10 NAV AUD"]),
    nav_lkr: safeFloat(row["Year-10 NAV LKR"]),
    delta_aud: safeFloat(row["Delta NAV AUD"]),
    delta_lkr: safeFloat(row["Delta NAV LKR"]),
  };
}

export function getRiskLevel(sensitivityDf: Row[], tornadoDf: Row[]): string {
  if (sensitivityDf.length === 0) return "Unknown";

  const baseRows =
    sensitivityDf.length > 0 && "Change" in sensitivityDf[0]
      ? sensitivityDf.filter((row) => Number(row["Change"]) === 0)
      : [];

  const baseNav =
    baseRows.length === 0
      ? safeFloat(sensitivityDf[0]["Base NAV AUD"])
      : safeFloat(baseRows[0]["Base NAV AUD"]);

  const worstCase = getWorstCaseNav(sensitivityDf);
  const worstNav = worstCase["nav_aud"];
  const downside = Math.max(0.0, baseNav - worstNav);

  if (worstNav < 0) return "High";

  let maxImpactPercent: number;

  if (baseNav === 0) {
    const mostSensitive = getMostSensitiveVariable(tornadoDf);
    maxImpactPercent = Math.abs(mostSensitive["max_impact_percent"]);
  } else {
    maxImpactPercent = downside / Math.abs(baseNav);
  }

  if (maxImpactPercent >= 0.5) return "High";
  if (maxImpactPercent >= 0.2) return "Medium";
  return "Low";
}

export function getRiskSummaryText(
  comparisonResult: Record<string, any>,
  mostSensitiveVariable: Record<string, any>,
  bestCaseNav: Record<string, any>,
  worstCaseNav: Record<string, any>,
  riskLevel: string
): string {
  const comparisonMessage = comparisonResult["message"] ?? "Scenario ranking is not available.";

  const variableName = mostSensitiveVariable["variable"] || "unknown";

  const bestVariable = bestCaseNav["variable"] || "unknown";
  const bestChange = bestCaseNav["change_label"] || "unknown change";

  const worstVariable = worstCaseNav["variable"] || "unknown";
  const worstChange = worstCaseNav["change_label"] || "unknown change";

  // pyround first: Python's f"{x:,.0f}" rounds half-to-even.
  const money = (value: number) =>
    pyround(value, 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    `${comparisonMessage} ` +
    `The biggest risk variable is ${variableName}. ` +
    `Best-case NAV is AUD ${money(bestCaseNav["nav_aud"] ?? 0.0)} ` +
    `when ${bestVariable} is ${bestChange}. ` +
    `Worst-case NAV is AUD ${money(worstCaseNav["nav_aud"] ?? 0.0)} ` +
    `when ${worstVariable} is ${worstChange}. ` +
    `Overall risk level: ${riskLevel}.`
  );
}
