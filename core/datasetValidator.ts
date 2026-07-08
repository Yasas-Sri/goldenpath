import { Dataset } from "./dataset";

export class DatasetValidationError extends Error {}

const REQUIRED_SECTIONS = [
  "metadata",
  "visa",
  "education",
  "income",
  "tax_and_retirement",
  "expenses",
  "car",
  "investment_and_economy",
  "loans_and_debt",
  "scenario_defaults",
  "sensitivity_analysis",
];

const REQUIRED_VALUE_PATHS = [
  "metadata.dataset_name",
  "metadata.country",
  "metadata.currency",
  "metadata.base_year",
  "metadata.time_horizon_years",

  "visa.student_visa.application_fee.value",
  "visa.student_visa.legal_work_hours_per_week.value",
  "visa.graduate_visa.application_fee.value",
  "visa.graduate_visa.duration_years.value",
  "visa.skilled_work_visa.application_fee.value",
  "visa.permanent_residency.application_fee.value",

  "education.masters_or_mba.annual_tuition_fee.value",
  "education.masters_or_mba.full_time_duration_years.value",
  "education.masters_or_mba.part_time_duration_years.value",

  "income.it_software_salary.graduate_annual_salary.value",
  "income.it_software_salary.mid_level_annual_salary.value",
  "income.it_software_salary.senior_annual_salary.value",
  "income.it_software_salary.annual_salary_growth_rate.value",
  "income.student_part_time_work.hourly_wage.value",
  "income.student_part_time_work.working_weeks_per_year.value",
  "income.spouse_income.annual_salary.value",

  "tax_and_retirement.effective_income_tax_rate.value",
  "tax_and_retirement.employer_superannuation_rate.value",

  "expenses.general_living_excluding_rent.single_monthly.value",
  "expenses.general_living_excluding_rent.couple_monthly.value",
  "expenses.general_living_excluding_rent.family_with_one_child_monthly.value",
  "expenses.rent.single_monthly.value",
  "expenses.rent.family_monthly.value",
  "expenses.childcare.monthly_cost_per_child.value",
  "expenses.childcare.applies_until_child_age.value",
  "expenses.transport.public_transport_monthly.value",
  "expenses.healthcare_or_insurance.monthly_cost.value",

  "car.used_car_purchase_price.value",
  "car.annual_insurance.value",
  "car.annual_fuel.value",
  "car.annual_maintenance.value",
  "car.annual_depreciation_rate.value",
  "car.car_loan_interest_rate.value",

  "investment_and_economy.inflation_rate.value",
  "investment_and_economy.savings_interest_rate.value",
  "investment_and_economy.investment_return_rate.value",

  "loans_and_debt.education_loan_interest_rate.value",
  "loans_and_debt.migration_loan_interest_rate.value",
  "loans_and_debt.borrowing_allowed",
  "loans_and_debt.negative_cash_allowed",

  "scenario_defaults.student_visa_path.study_years",
  "scenario_defaults.student_visa_path.full_time_work_start_year",
  "scenario_defaults.student_visa_path.graduate_visa_start_year",
  "scenario_defaults.working_visa_path.full_time_work_start_year",
  "scenario_defaults.life_scenarios.single",
  "scenario_defaults.life_scenarios.married_no_child",
  "scenario_defaults.life_scenarios.married_one_child",
  "scenario_defaults.life_scenarios.married_two_children",
];

const SENSITIVITY_REQUIRED_KEYWORDS: Record<string, string[]> = {
  "salary growth": ["salary_growth", "salary growth", "salary_growth_rate", "annual_salary_growth_rate"],
  rent: ["rent", "rent_multiplier"],
  tuition: ["tuition", "tuition_multiplier"],
  childcare: ["childcare", "childcare_multiplier"],
  "investment return": ["investment_return", "investment return", "investment_return_rate"],
  "exchange rate": ["exchange_rate", "exchange rate", "_to_lkr"],
  "spouse income": ["spouse_income", "spouse income"],
};

function getNestedValueStrict(data: any, path: string): any {
  let current = data;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      throw new DatasetValidationError(
        `Invalid structure at '${path}'. Expected dictionary before key '${key}'.`
      );
    }
    if (!(key in current)) {
      throw new DatasetValidationError(`Missing required field: ${path}`);
    }
    current = current[key];
  }
  return current;
}

function validateRequiredSections(data: Dataset): void {
  const missingSections = REQUIRED_SECTIONS.filter((section) => !(section in data));
  if (missingSections.length > 0) {
    throw new DatasetValidationError(
      "Missing required sections: " + missingSections.join(", ")
    );
  }
}

function validateRequiredValues(data: Dataset): void {
  const missingOrEmpty: string[] = [];

  for (const path of REQUIRED_VALUE_PATHS) {
    try {
      const value = getNestedValueStrict(data, path);
      if (value == null || value === "") missingOrEmpty.push(path);
    } catch {
      missingOrEmpty.push(path);
    }
  }

  if (missingOrEmpty.length > 0) {
    throw new DatasetValidationError(
      "Missing or empty required values: " + missingOrEmpty.join(", ")
    );
  }
}

function getDatasetCurrencyStrict(data: Dataset): string {
  const currency = getNestedValueStrict(data, "metadata.currency");
  if (currency == null) throw new DatasetValidationError("metadata.currency is missing.");

  const code = String(currency).trim().toUpperCase();
  if (!code) throw new DatasetValidationError("metadata.currency cannot be empty.");
  return code;
}

function validateExchangeRateField(data: Dataset): void {
  const currency = getDatasetCurrencyStrict(data);
  const path = `investment_and_economy.${currency.toLowerCase()}_to_lkr_exchange_rate.value`;

  let exchangeRate: any;
  try {
    exchangeRate = getNestedValueStrict(data, path);
  } catch {
    throw new DatasetValidationError(
      `Missing exchange-rate field for metadata.currency. Expected: ${path}`
    );
  }

  const parsed = Number(exchangeRate);
  if (exchangeRate == null || typeof exchangeRate === "boolean" || Number.isNaN(parsed)) {
    throw new DatasetValidationError(`Exchange-rate value must be numeric: ${path}`);
  }
  if (parsed <= 0) {
    throw new DatasetValidationError(`Exchange-rate value must be greater than zero: ${path}`);
  }
}

function isValueRecord(node: any): boolean {
  return node != null && typeof node === "object" && !Array.isArray(node) && "value" in node;
}

function collectValueRecords(data: Dataset): Array<[string[], Record<string, any>]> {
  const records: Array<[string[], Record<string, any>]> = [];

  const walk = (node: any, path: string[]): void => {
    if (isValueRecord(node)) {
      records.push([path, node]);
      return;
    }
    if (node != null && typeof node === "object" && !Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) {
        walk(value, [...path, String(key)]);
      }
    }
  };

  walk(data, []);
  return records;
}

function looksLikeCurrencyCode(value: any): boolean {
  if (value == null) return false;
  const text = String(value).trim().toUpperCase();
  return text.length === 3 && /^[A-Z]+$/.test(text);
}

function isExchangeRatePath(pathParts: string[]): boolean {
  const pathText = pathParts.join(".").toLowerCase();
  return pathText.includes("exchange_rate") || pathText.includes("to_lkr");
}

function validateCurrencyFields(data: Dataset): void {
  const expectedCurrency = getDatasetCurrencyStrict(data);
  const records = collectValueRecords(data);

  const currencyErrors: string[] = [];

  for (const [pathParts, node] of records) {
    if (isExchangeRatePath(pathParts)) continue;

    const recordCurrency = node["currency"];
    if (!recordCurrency) continue;
    if (!looksLikeCurrencyCode(recordCurrency)) continue;

    const normalized = String(recordCurrency).trim().toUpperCase();
    if (normalized !== expectedCurrency) {
      currencyErrors.push(
        `${pathParts.join(".")} has currency ${normalized}, expected ${expectedCurrency}`
      );
    }
  }

  if (currencyErrors.length > 0) {
    throw new DatasetValidationError(
      "Currency mismatch detected. This dataset is unsafe to simulate until fixed. " +
        currencyErrors.slice(0, 20).join(" | ")
    );
  }
}

function validateSensitivityAnalysis(data: Dataset): void {
  const sensitivityData = data["sensitivity_analysis"];

  if (sensitivityData == null) {
    throw new DatasetValidationError("Missing required section: sensitivity_analysis");
  }

  const isEmptyObject =
    typeof sensitivityData === "object" && Object.keys(sensitivityData).length === 0;
  if (isEmptyObject) {
    throw new DatasetValidationError("sensitivity_analysis cannot be empty.");
  }

  const sensitivityText = JSON.stringify(sensitivityData).toLowerCase();

  const missingVariables = Object.entries(SENSITIVITY_REQUIRED_KEYWORDS)
    .filter(([, keywords]) => !keywords.some((keyword) => sensitivityText.includes(keyword.toLowerCase())))
    .map(([variableName]) => variableName);

  if (missingVariables.length > 0) {
    throw new DatasetValidationError(
      "Missing sensitivity variables: " + missingVariables.join(", ")
    );
  }
}

/** Mirrors Python load_dataset validation — run before simulating a dataset. */
export function validateDataset(data: Dataset): void {
  validateRequiredSections(data);
  validateRequiredValues(data);
  validateExchangeRateField(data);
  validateCurrencyFields(data);
  validateSensitivityAnalysis(data);
}
