import { Dataset, Row, ScenarioConfig, getValue } from "./dataset";
import { getCountryCurrency } from "./currency";
import { pyround } from "./pyround";
import { calculateTuitionExpense, getEducationStatusForYear } from "./educationModel";
import { calculateVisaFeeExpense, getVisaStatusForYear, getPrApplicationYear } from "./visaModel";
import {
  calculateChildcareChildrenCount,
  getGeneralLivingExpenseType,
  getGeneralLivingMultiplier,
  getLifeStageLabel,
  getNumberOfChildrenForYear,
  getScenarioOverrides,
  isMarriedOrFamily,
} from "./familyModel";

export function getInflationFactor(year: number, inflationRate: number): number {
  return (1 + inflationRate) ** (year - 1);
}

export function calculateRentExpense(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): number {
  const rentMultiplier = Number(scenarioConfig["adjustable_inputs"]["rent_multiplier"]);

  const monthlyRent = isMarriedOrFamily(scenarioConfig, year)
    ? Number(getValue(dataset, "expenses.rent.family_monthly.value"))
    : Number(getValue(dataset, "expenses.rent.single_monthly.value"));

  return monthlyRent * 12 * inflationFactor * rentMultiplier;
}

export function calculateGeneralLivingExpense(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): number {
  const expenseType = getGeneralLivingExpenseType(scenarioConfig, year);

  const baseMonthlyLiving = Number(
    getValue(dataset, `expenses.general_living_excluding_rent.${expenseType}.value`)
  );

  const livingMultiplier = getGeneralLivingMultiplier(scenarioConfig, year);

  return baseMonthlyLiving * livingMultiplier * 12 * inflationFactor;
}

export function calculateHealthcareExpense(
  dataset: Dataset,
  year: number,
  inflationFactor: number
): number {
  const monthlyHealthcare = Number(
    getValue(dataset, "expenses.healthcare_or_insurance.monthly_cost.value")
  );
  return monthlyHealthcare * 12 * inflationFactor;
}

export function calculateTransportExpense(
  dataset: Dataset,
  year: number,
  inflationFactor: number
): number {
  const monthlyTransport = Number(
    getValue(dataset, "expenses.transport.public_transport_monthly.value")
  );
  return monthlyTransport * 12 * inflationFactor;
}

export function calculateChildcareExpense(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): number {
  const childcareMultiplier = Number(scenarioConfig["adjustable_inputs"]["childcare_multiplier"]);

  const activeChildren = calculateChildcareChildrenCount(dataset, scenarioConfig, year);
  if (activeChildren === 0) return 0.0;

  const monthlyChildcarePerChild = Number(
    getValue(dataset, "expenses.childcare.monthly_cost_per_child.value")
  );

  return monthlyChildcarePerChild * 12 * activeChildren * inflationFactor * childcareMultiplier;
}

export function getStaticCarPurchaseYear(scenarioConfig: ScenarioConfig): number {
  const overrides = getScenarioOverrides(scenarioConfig);

  if (overrides["car_timing_override_enabled"] ?? false) {
    const carPurchaseYear = overrides["car_purchase_year"];
    if (carPurchaseYear == null) return 0;
    return Math.trunc(Number(carPurchaseYear));
  }

  const migrationPathDefaults = scenarioConfig["migration_path_defaults"];
  return Math.trunc(Number(migrationPathDefaults["car_purchase_allowed_from_year"] ?? 3));
}

export interface CarResult {
  car_purchase_cost: number;
  car_annual_running_cost: number;
  car_total_cost: number;
  car_value: number;
}

const ZERO_CAR_RESULT: CarResult = {
  car_purchase_cost: 0.0,
  car_annual_running_cost: 0.0,
  car_total_cost: 0.0,
  car_value: 0.0,
};

export function calculateCarExpenseAndValue(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  inflationFactor: number
): CarResult {
  const overrides = getScenarioOverrides(scenarioConfig);

  let buyCar = Boolean(scenarioConfig["car_settings"]["buy_car"]);

  if (overrides["car_timing_override_enabled"] ?? false) {
    buyCar = Boolean(overrides["buy_car"] ?? buyCar);
  }

  if (!buyCar) return { ...ZERO_CAR_RESULT };

  // Dynamic timing: nav model decides the purchase year later.
  if (overrides["car_purchase_after_positive_cash_flow"] ?? false) {
    return { ...ZERO_CAR_RESULT };
  }

  const carPurchaseYear = getStaticCarPurchaseYear(scenarioConfig);
  if (carPurchaseYear <= 0 || year < carPurchaseYear) return { ...ZERO_CAR_RESULT };

  const baseCarPurchasePrice = Number(getValue(dataset, "car.used_car_purchase_price.value"));
  const annualInsurance = Number(getValue(dataset, "car.annual_insurance.value"));
  const annualFuel = Number(getValue(dataset, "car.annual_fuel.value"));
  const annualMaintenance = Number(getValue(dataset, "car.annual_maintenance.value"));
  const depreciationRate = Number(getValue(dataset, "car.annual_depreciation_rate.value"));

  const inflatedCarPurchasePrice = baseCarPurchasePrice * inflationFactor;

  const carPurchaseCost = year === carPurchaseYear ? inflatedCarPurchasePrice : 0.0;

  const annualRunningCost = (annualInsurance + annualFuel + annualMaintenance) * inflationFactor;

  const yearsSincePurchase = year - carPurchaseYear;
  const carValue = inflatedCarPurchasePrice * (1 - depreciationRate) ** yearsSincePurchase;

  return {
    car_purchase_cost: carPurchaseCost,
    car_annual_running_cost: annualRunningCost,
    car_total_cost: carPurchaseCost + annualRunningCost,
    car_value: carValue,
  };
}

export function calculateYearlyExpenses(dataset: Dataset, scenarioConfig: ScenarioConfig): Row[] {
  const timeHorizonYears = Math.trunc(Number(getValue(dataset, "metadata.time_horizon_years")));
  const localCurrency = getCountryCurrency(dataset);
  const inflationRate = Number(scenarioConfig["adjustable_inputs"]["inflation_rate"]);

  const records: Row[] = [];

  for (let year = 1; year <= timeHorizonYears; year++) {
    const inflationFactor = getInflationFactor(year, inflationRate);

    const childrenCount = getNumberOfChildrenForYear(scenarioConfig, year);
    const childrenInChildcare = calculateChildcareChildrenCount(dataset, scenarioConfig, year);

    const rent = calculateRentExpense(dataset, scenarioConfig, year, inflationFactor);
    const generalLiving = calculateGeneralLivingExpense(dataset, scenarioConfig, year, inflationFactor);
    const tuition = calculateTuitionExpense(dataset, scenarioConfig, year, inflationFactor);
    const visaFees = calculateVisaFeeExpense(dataset, scenarioConfig, year, inflationFactor);
    const healthcare = calculateHealthcareExpense(dataset, year, inflationFactor);
    const transport = calculateTransportExpense(dataset, year, inflationFactor);
    const childcare = calculateChildcareExpense(dataset, scenarioConfig, year, inflationFactor);
    const carResult = calculateCarExpenseAndValue(dataset, scenarioConfig, year, inflationFactor);

    // Debt Cost starts at 0.0; nav model overwrites it once balances are known.
    const debtCost = 0.0;

    const totalExpenses =
      rent +
      generalLiving +
      tuition +
      visaFees +
      healthcare +
      transport +
      childcare +
      carResult.car_total_cost +
      debtCost;

    records.push({
      Year: year,
      Currency: localCurrency,
      "Inflation Factor": pyround(inflationFactor, 4),
      "Life Stage": getLifeStageLabel(year, scenarioConfig),
      "Children Count": childrenCount,
      "Children in Childcare": childrenInChildcare,
      "Education Status": getEducationStatusForYear(scenarioConfig, year),
      "Visa Status": getVisaStatusForYear(scenarioConfig, year),
      "PR Application Year": getPrApplicationYear(scenarioConfig),
      Rent: pyround(rent, 2),
      "General Living": pyround(generalLiving, 2),
      Tuition: pyround(tuition, 2),
      "Visa Fees": pyround(visaFees, 2),
      "Healthcare / Insurance": pyround(healthcare, 2),
      Transport: pyround(transport, 2),
      Childcare: pyround(childcare, 2),
      "Car Purchase Cost": pyround(carResult.car_purchase_cost, 2),
      "Car Running Cost": pyround(carResult.car_annual_running_cost, 2),
      "Car Cost": pyround(carResult.car_total_cost, 2),
      "Debt Cost": pyround(debtCost, 2),
      "Total Expenses": pyround(totalExpenses, 2),
      "Car Value": pyround(carResult.car_value, 2),
    });
  }

  return records;
}

export function getExpenseSummary(expenseDf: Row[]): Record<string, number> {
  const sum = (column: string) => expenseDf.reduce((total, row) => total + Number(row[column]), 0);
  const lastRow = expenseDf[expenseDf.length - 1];

  return {
    total_expenses: sum("Total Expenses"),
    total_rent: sum("Rent"),
    total_living: sum("General Living"),
    total_tuition: sum("Tuition"),
    total_visa_fees: sum("Visa Fees"),
    total_childcare: sum("Childcare"),
    total_car_cost: sum("Car Cost"),
    total_debt_cost: sum("Debt Cost"),
    year_10_expenses: Number(lastRow["Total Expenses"]),
    year_10_car_value: Number(lastRow["Car Value"]),
  };
}
