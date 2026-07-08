import { Dataset, ScenarioConfig, getValue } from "./dataset";
import {
  resolveEducationMode,
  resolvePrApplicationYear,
  resolveCarPurchaseTiming,
  resolveChildTiming,
  resolveInvestmentSplit,
} from "./scenarioOptions";
import { getMarriageYear, getFirstChildYear, getSecondChildYear } from "./familyModel";

export const MIGRATION_PATH_OPTIONS: Record<string, string> = {
  "Student visa path": "student_visa_path",
  "Working visa path": "working_visa_path",
};

export const LIFE_SCENARIO_OPTIONS: Record<string, string> = {
  Single: "single",
  "Married no child": "married_no_child",
  "Married one child": "married_one_child",
  "Married two children": "married_two_children",
};

export const CAR_OPTIONS: Record<string, boolean> = {
  "No car": false,
  "Buy car": true,
};

export const INVESTMENT_OPTIONS: Record<string, string> = {
  "Save only": "save_only",
  "Invest positive cash flow": "invest_positive_cash_flow",
};

export const SPOUSE_INCOME_OPTIONS: Record<string, string> = {
  Conservative: "conservative",
  Moderate: "moderate",
  Optimistic: "optimistic",
};

export function getDefaultModelInputs(dataset: Dataset): Record<string, number> {
  return {
    salary_growth_rate: getValue(
      dataset,
      "income.it_software_salary.annual_salary_growth_rate.value"
    ),
    inflation_rate: getValue(dataset, "investment_and_economy.inflation_rate.value"),
    investment_return_rate: getValue(
      dataset,
      "investment_and_economy.investment_return_rate.value"
    ),
    rent_multiplier: 1.0,
    tuition_multiplier: 1.0,
    childcare_multiplier: 1.0,
  };
}

export function getDefaultPrApplicationYear(migrationPathKey: string): number | null {
  if (migrationPathKey === "student_visa_path") return 6;
  if (migrationPathKey === "working_visa_path") return 4;
  return null;
}

function getDefaultEducationSettings(
  migrationPathKey: string,
  migrationPathDefaults: Record<string, any>
): Record<string, any> {
  if (migrationPathKey === "student_visa_path") {
    return {
      education_override_enabled: false,
      education_study_years: migrationPathDefaults["study_years"] ?? [],
      tuition_load: 1.0,
    };
  }

  return {
    education_override_enabled: false,
    education_study_years: [],
    tuition_load: 0.0,
  };
}

export function normalizeScenarioOverrides(
  scenarioOverrides: Record<string, any>,
  migrationPathKey: string,
  migrationPathDefaults: Record<string, any>
): Record<string, any> {
  const defaultEducationSettings = getDefaultEducationSettings(
    migrationPathKey,
    migrationPathDefaults
  );

  const normalized: Record<string, any> = {
    ...defaultEducationSettings,

    pr_override_enabled: true,
    pr_application_year: getDefaultPrApplicationYear(migrationPathKey),

    car_timing_override_enabled: false,
    buy_car: null,
    car_purchase_year: null,
    car_purchase_after_positive_cash_flow: false,

    first_child_override_enabled: false,
    first_child_year_override: null,
    second_child_override_enabled: false,
    second_child_year_override: null,

    // Model-only assumption: two-child living cost = one-child cost * 1.20.
    family_with_two_children_living_multiplier: 1.2,

    investment_split: "Dataset default",
    investment_percentage: 0.0,

    ...scenarioOverrides,
  };

  if (normalized["education_study_years"] == null) {
    normalized["education_study_years"] = [];
  }
  if (normalized["tuition_load"] == null) {
    normalized["tuition_load"] = 0.0;
  }
  if (normalized["family_with_two_children_living_multiplier"] == null) {
    normalized["family_with_two_children_living_multiplier"] = 1.2;
  }

  return normalized;
}

export interface ScenarioInputs {
  migration_path_label: string;
  life_scenario_label: string;
  car_option_label: string;
  investment_option_label: string;
  spouse_income_case_label: string;
  salary_growth_rate: number;
  inflation_rate: number;
  investment_return_rate: number;
  rent_multiplier: number;
  tuition_multiplier: number;
  childcare_multiplier: number;
  education_mode_label?: string | null;
  pr_timing_label?: string | null;
  custom_pr_year?: number | null;
  car_purchase_timing_label?: string | null;
  first_child_timing_label?: string | null;
  second_child_timing_label?: string | null;
  investment_split_label?: string | null;
}

export function buildScenarioConfig(dataset: Dataset, inputs: ScenarioInputs): ScenarioConfig {
  const migrationPathKey = MIGRATION_PATH_OPTIONS[inputs.migration_path_label];
  const lifeScenarioKey = LIFE_SCENARIO_OPTIONS[inputs.life_scenario_label];
  const spouseIncomeCaseKey = SPOUSE_INCOME_OPTIONS[inputs.spouse_income_case_label];

  const oldInvestmentMethod = INVESTMENT_OPTIONS[inputs.investment_option_label];

  const migrationPathDefaults = dataset["scenario_defaults"][migrationPathKey];
  const lifeScenarioDefaults = dataset["scenario_defaults"]["life_scenarios"][lifeScenarioKey];

  const spouseIncomePercentage =
    dataset["income"]["spouse_income"]["income_cases"][spouseIncomeCaseKey];

  const educationOverrides = resolveEducationMode(inputs.education_mode_label ?? null);
  const prOverrides = resolvePrApplicationYear(
    inputs.pr_timing_label ?? null,
    migrationPathKey,
    inputs.custom_pr_year ?? null
  );
  const carTimingOverrides = resolveCarPurchaseTiming(inputs.car_purchase_timing_label ?? null);
  const childTimingOverrides = resolveChildTiming(
    inputs.first_child_timing_label ?? null,
    inputs.second_child_timing_label ?? null
  );
  const investmentSplitOverrides = resolveInvestmentSplit(
    inputs.investment_split_label ?? null,
    oldInvestmentMethod
  );

  const rawScenarioOverrides = {
    ...educationOverrides,
    ...prOverrides,
    ...carTimingOverrides,
    ...childTimingOverrides,
    ...investmentSplitOverrides,
  };

  const scenarioOverrides = normalizeScenarioOverrides(
    rawScenarioOverrides,
    migrationPathKey,
    migrationPathDefaults
  );

  const buyCar = scenarioOverrides["car_timing_override_enabled"]
    ? Boolean(scenarioOverrides["buy_car"])
    : CAR_OPTIONS[inputs.car_option_label];

  return {
    selected_labels: {
      migration_path: inputs.migration_path_label,
      life_scenario: inputs.life_scenario_label,
      car_option: inputs.car_option_label,
      investment_option: inputs.investment_option_label,
      spouse_income_case: inputs.spouse_income_case_label,
      education_mode: inputs.education_mode_label || "Dataset default",
      pr_timing: inputs.pr_timing_label || "Dataset default",
      car_purchase_timing: inputs.car_purchase_timing_label || "Dataset default",
      first_child_timing: inputs.first_child_timing_label || "Dataset default",
      second_child_timing: inputs.second_child_timing_label || "Dataset default",
      investment_split: scenarioOverrides["investment_split"],
    },

    selected_keys: {
      migration_path: migrationPathKey,
      life_scenario: lifeScenarioKey,
      investment_option: oldInvestmentMethod,
      spouse_income_case: spouseIncomeCaseKey,
    },

    migration_path_defaults: migrationPathDefaults,
    life_scenario_defaults: lifeScenarioDefaults,

    car_settings: {
      buy_car: buyCar,
    },

    investment_settings: {
      method: oldInvestmentMethod,
      investment_percentage: scenarioOverrides["investment_percentage"],
    },

    spouse_income_settings: {
      case: spouseIncomeCaseKey,
      income_percentage: spouseIncomePercentage,
    },

    adjustable_inputs: {
      salary_growth_rate: inputs.salary_growth_rate,
      inflation_rate: inputs.inflation_rate,
      investment_return_rate: inputs.investment_return_rate,
      rent_multiplier: inputs.rent_multiplier,
      tuition_multiplier: inputs.tuition_multiplier,
      childcare_multiplier: inputs.childcare_multiplier,
    },

    scenario_overrides: scenarioOverrides,
  };
}

export function createScenarioSummary(scenarioConfig: ScenarioConfig): Record<string, any> {
  const labels = scenarioConfig["selected_labels"];
  const adjustableInputs = scenarioConfig["adjustable_inputs"];
  const spouseIncomeSettings = scenarioConfig["spouse_income_settings"];
  const carSettings = scenarioConfig["car_settings"];
  const investmentSettings = scenarioConfig["investment_settings"];
  const scenarioOverrides = scenarioConfig["scenario_overrides"];

  return {
    "Migration Path": labels["migration_path"],
    "Life Scenario": labels["life_scenario"],

    "Education Mode": labels["education_mode"],
    "Education Study Years": scenarioOverrides["education_study_years"],
    "Tuition Load": scenarioOverrides["tuition_load"],

    "PR Timing": labels["pr_timing"],
    "PR Application Year": scenarioOverrides["pr_application_year"],

    "Car Option": labels["car_option"],
    "Car Purchase Timing": labels["car_purchase_timing"],
    "Buy Car": carSettings["buy_car"],
    "Car Purchase Year": scenarioOverrides["car_purchase_year"],
    "Car After Positive Cash Flow": scenarioOverrides["car_purchase_after_positive_cash_flow"],

    "First Child Timing": labels["first_child_timing"],
    "Second Child Timing": labels["second_child_timing"],
    "First Child Year Override": scenarioOverrides["first_child_year_override"],
    "Second Child Year Override": scenarioOverrides["second_child_year_override"],

    "Effective Marriage Year": getMarriageYear(scenarioConfig),
    "Effective First Child Year": getFirstChildYear(scenarioConfig),
    "Effective Second Child Year": getSecondChildYear(scenarioConfig),
    "Two-Child Living Cost Multiplier":
      scenarioOverrides["family_with_two_children_living_multiplier"],

    "Investment Option": labels["investment_option"],
    "Investment Split": labels["investment_split"],
    "Investment Percentage": investmentSettings["investment_percentage"],

    "Spouse Income Case": labels["spouse_income_case"],
    "Spouse Income Percentage": spouseIncomeSettings["income_percentage"],

    "Salary Growth Rate": adjustableInputs["salary_growth_rate"],
    "Inflation Rate": adjustableInputs["inflation_rate"],
    "Investment Return Rate": adjustableInputs["investment_return_rate"],
    "Rent Multiplier": adjustableInputs["rent_multiplier"],
    "Tuition Multiplier": adjustableInputs["tuition_multiplier"],
    "Childcare Multiplier": adjustableInputs["childcare_multiplier"],
  };
}
