import { Dataset, ScenarioConfig, getValue } from "./dataset";
import { getScenarioOverrides } from "./familyModel";

export function getDefaultStudyYears(scenarioConfig: ScenarioConfig): number[] {
  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  const migrationPathDefaults = scenarioConfig["migration_path_defaults"];

  if (migrationPathKey !== "student_visa_path") return [];

  return (migrationPathDefaults["study_years"] ?? []).map((year: any) =>
    Math.trunc(Number(year))
  );
}

export function getDefaultTuitionLoad(scenarioConfig: ScenarioConfig): number {
  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  return migrationPathKey === "student_visa_path" ? 1.0 : 0.0;
}

export function getStudyYears(scenarioConfig: ScenarioConfig): number[] {
  const overrides = getScenarioOverrides(scenarioConfig);

  if (overrides["education_override_enabled"] ?? false) {
    return (overrides["education_study_years"] ?? []).map((year: any) =>
      Math.trunc(Number(year))
    );
  }

  return getDefaultStudyYears(scenarioConfig);
}

export function getTuitionLoad(scenarioConfig: ScenarioConfig): number {
  const overrides = getScenarioOverrides(scenarioConfig);

  if (overrides["education_override_enabled"] ?? false) {
    // Python: float(overrides.get("tuition_load") or 0.0) — falsy 0 stays 0.
    return Number(overrides["tuition_load"] || 0.0);
  }

  return getDefaultTuitionLoad(scenarioConfig);
}

export function getEducationStatusForYear(scenarioConfig: ScenarioConfig, year: number): string {
  const studyYears = getStudyYears(scenarioConfig);
  const tuitionLoad = getTuitionLoad(scenarioConfig);

  if (!studyYears.includes(year) || tuitionLoad <= 0) return "Not studying";
  if (tuitionLoad >= 0.75) return "Full-time study";
  return "Part-time study";
}

export function calculateTuitionExpense(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): number {
  const studyYears = getStudyYears(scenarioConfig);
  const tuitionLoad = getTuitionLoad(scenarioConfig);

  if (!studyYears.includes(year) || tuitionLoad <= 0) return 0.0;

  const tuitionMultiplier = Number(scenarioConfig["adjustable_inputs"]["tuition_multiplier"]);
  const annualTuition = Number(
    getValue(dataset, "education.masters_or_mba.annual_tuition_fee.value")
  );

  return annualTuition * tuitionLoad * inflationFactor * tuitionMultiplier;
}
