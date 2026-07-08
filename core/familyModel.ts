import { Dataset, ScenarioConfig, getValue } from "./dataset";

export const FAMILY_WITH_TWO_CHILDREN_LIVING_MULTIPLIER = 1.2;

/** None, 0, negative, and invalid values become null. */
export function normalizeYear(value: any): number | null {
  if (value == null) return null;
  const year = Math.trunc(Number(value));
  if (Number.isNaN(year)) return null;
  if (year <= 0) return null;
  return year;
}

export function getScenarioOverrides(scenarioConfig: ScenarioConfig): Record<string, any> {
  return scenarioConfig["scenario_overrides"] ?? {};
}

/**
 * Apply family/child timing overrides without changing the dataset.
 * Rule: a second child cannot exist if the first child is disabled or earlier.
 */
export function getEffectiveLifeScenarioDefaults(
  scenarioConfig: ScenarioConfig
): Record<string, any> {
  const originalDefaults = scenarioConfig["life_scenario_defaults"] ?? {};
  const effectiveDefaults: Record<string, any> = structuredClone(originalDefaults);

  const overrides = getScenarioOverrides(scenarioConfig);

  if (overrides["first_child_override_enabled"] ?? false) {
    const firstChildYear = normalizeYear(overrides["first_child_year_override"]);
    effectiveDefaults["first_child_year"] = firstChildYear;
    if (firstChildYear === null) {
      effectiveDefaults["second_child_year"] = null;
    }
  }

  if (overrides["second_child_override_enabled"] ?? false) {
    effectiveDefaults["second_child_year"] = normalizeYear(
      overrides["second_child_year_override"]
    );
  }

  const marriageYear = normalizeYear(effectiveDefaults["marriage_year"]);
  const firstChildYear = normalizeYear(effectiveDefaults["first_child_year"]);
  const secondChildYear = normalizeYear(effectiveDefaults["second_child_year"]);

  effectiveDefaults["marriage_year"] = marriageYear;
  effectiveDefaults["first_child_year"] = firstChildYear;
  effectiveDefaults["second_child_year"] = secondChildYear;

  if (firstChildYear === null) {
    effectiveDefaults["second_child_year"] = null;
  }

  if (firstChildYear !== null && secondChildYear !== null && secondChildYear < firstChildYear) {
    effectiveDefaults["second_child_year"] = null;
  }

  return effectiveDefaults;
}

export function getMarriageYear(scenarioConfig: ScenarioConfig): number | null {
  return normalizeYear(getEffectiveLifeScenarioDefaults(scenarioConfig)["marriage_year"]);
}

export function getFirstChildYear(scenarioConfig: ScenarioConfig): number | null {
  return normalizeYear(getEffectiveLifeScenarioDefaults(scenarioConfig)["first_child_year"]);
}

export function getSecondChildYear(scenarioConfig: ScenarioConfig): number | null {
  return normalizeYear(getEffectiveLifeScenarioDefaults(scenarioConfig)["second_child_year"]);
}

export function getChildBirthYears(scenarioConfig: ScenarioConfig): Array<number | null> {
  return [getFirstChildYear(scenarioConfig), getSecondChildYear(scenarioConfig)];
}

export function getNumberOfChildrenForYear(scenarioConfig: ScenarioConfig, year: number): number {
  let childrenCount = 0;
  for (const childBirthYear of getChildBirthYears(scenarioConfig)) {
    if (childBirthYear === null) continue;
    if (year >= childBirthYear) childrenCount += 1;
  }
  return childrenCount;
}

export function calculateChildcareChildrenCount(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number
): number {
  const childcareUntilAge = Math.trunc(
    Number(getValue(dataset, "expenses.childcare.applies_until_child_age.value"))
  );

  let activeChildcareChildren = 0;

  for (const childBirthYear of getChildBirthYears(scenarioConfig)) {
    if (childBirthYear === null) continue;

    const childAge = year - childBirthYear;
    if (childAge < 0) continue;
    if (childAge <= childcareUntilAge) activeChildcareChildren += 1;
  }

  return activeChildcareChildren;
}

export function isMarriedOrFamily(scenarioConfig: ScenarioConfig, year: number): boolean {
  const marriageYear = getMarriageYear(scenarioConfig);
  if (marriageYear !== null && year >= marriageYear) return true;
  if (getNumberOfChildrenForYear(scenarioConfig, year) > 0) return true;
  return false;
}

export function hasChild(scenarioConfig: ScenarioConfig, year: number): boolean {
  return getNumberOfChildrenForYear(scenarioConfig, year) > 0;
}

export function getGeneralLivingExpenseType(scenarioConfig: ScenarioConfig, year: number): string {
  const lifeScenarioKey = scenarioConfig["selected_keys"]["life_scenario"];
  const marriageYear = getMarriageYear(scenarioConfig);
  const childrenCount = getNumberOfChildrenForYear(scenarioConfig, year);

  if (lifeScenarioKey === "single" && childrenCount === 0) return "single_monthly";
  if (marriageYear !== null && year < marriageYear && childrenCount === 0) return "single_monthly";
  if (childrenCount >= 1) return "family_with_one_child_monthly";
  if (marriageYear !== null && year >= marriageYear) return "couple_monthly";
  return "single_monthly";
}

export function getGeneralLivingMultiplier(scenarioConfig: ScenarioConfig, year: number): number {
  const childrenCount = getNumberOfChildrenForYear(scenarioConfig, year);
  if (childrenCount < 2) return 1.0;

  const overrides = getScenarioOverrides(scenarioConfig);
  return Number(
    overrides["family_with_two_children_living_multiplier"] ??
      FAMILY_WITH_TWO_CHILDREN_LIVING_MULTIPLIER
  );
}

export function getLifeStageLabel(
  year: number,
  scenarioConfig: ScenarioConfig | null = null
): string {
  if (scenarioConfig === null) return `Year ${year}`;

  const marriageYear = getMarriageYear(scenarioConfig);
  const childrenCount = getNumberOfChildrenForYear(scenarioConfig, year);

  if (childrenCount >= 2) return "Family with 2 children";
  if (childrenCount === 1) return "Family with 1 child";
  if (marriageYear !== null && year >= marriageYear) return "Married / couple";
  return "Single";
}
