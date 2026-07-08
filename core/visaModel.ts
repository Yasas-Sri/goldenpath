import { Dataset, ScenarioConfig, getValue } from "./dataset";
import { getScenarioOverrides } from "./familyModel";

function getLegacyDefaultPrApplicationYear(scenarioConfig: ScenarioConfig): number | null {
  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  if (migrationPathKey === "student_visa_path") return 6;
  if (migrationPathKey === "working_visa_path") return 4;
  return null;
}

export function getPrApplicationYear(scenarioConfig: ScenarioConfig): number | null {
  const overrides = getScenarioOverrides(scenarioConfig);

  if ("pr_application_year" in overrides) {
    const prApplicationYear = overrides["pr_application_year"];
    if (prApplicationYear == null) return null;
    return Math.trunc(Number(prApplicationYear));
  }

  return getLegacyDefaultPrApplicationYear(scenarioConfig);
}

export function getVisaStatusForYear(scenarioConfig: ScenarioConfig, year: number): string {
  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  const migrationPathDefaults = scenarioConfig["migration_path_defaults"];

  const prApplicationYear = getPrApplicationYear(scenarioConfig);

  if (prApplicationYear !== null && year >= prApplicationYear) {
    return "PR application / PR pathway";
  }

  if (migrationPathKey === "student_visa_path") {
    const graduateVisaStartYear = Math.trunc(
      Number(migrationPathDefaults["graduate_visa_start_year"] ?? 3)
    );
    if (year < graduateVisaStartYear) return "Student visa";
    return "Graduate visa";
  }

  if (migrationPathKey === "working_visa_path") return "Skilled work visa";

  return "Unknown visa status";
}

export function calculateVisaFeeExpense(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): number {
  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  const migrationPathDefaults = scenarioConfig["migration_path_defaults"];

  const studentVisaFee = Number(getValue(dataset, "visa.student_visa.application_fee.value"));
  const graduateVisaFee = Number(getValue(dataset, "visa.graduate_visa.application_fee.value"));
  const skilledWorkVisaFee = Number(
    getValue(dataset, "visa.skilled_work_visa.application_fee.value")
  );
  const prApplicationFee = Number(
    getValue(dataset, "visa.permanent_residency.application_fee.value")
  );

  let visaFee = 0.0;
  const prApplicationYear = getPrApplicationYear(scenarioConfig);

  if (migrationPathKey === "student_visa_path") {
    const graduateVisaStartYear = Math.trunc(
      Number(migrationPathDefaults["graduate_visa_start_year"] ?? 3)
    );

    if (year === 1) visaFee += studentVisaFee;
    if (year === graduateVisaStartYear) visaFee += graduateVisaFee;
  } else if (migrationPathKey === "working_visa_path") {
    if (year === 1) visaFee += skilledWorkVisaFee;
  }

  if (prApplicationYear !== null && year === prApplicationYear) {
    visaFee += prApplicationFee;
  }

  return visaFee * inflationFactor;
}
