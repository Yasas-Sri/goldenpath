import { Dataset, Row, ScenarioConfig, getValue } from "./dataset";
import { getCountryCurrency, getExchangeRateToLkr } from "./currency";
import { pyround } from "./pyround";
import {
  allocateCashShortageToDebtCategories,
  calculateCarLoanDebt,
  calculateDebtInterestCosts,
  calculateEducationDebt,
  calculateMigrationDebt,
  calculateNegativeCashDebt,
  calculateTotalLiabilities,
  getDebtInterestRates,
  repayDebtsWithPositiveCashFlow,
} from "./debtModel";
import { getScenarioOverrides } from "./familyModel";
import { CarResult, getInflationFactor } from "./expenseModel";

function calculateDynamicCarExpenseAndValue(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  year: number,
  carPurchaseYear: number
): CarResult {
  const inflationRate = Number(scenarioConfig["adjustable_inputs"]["inflation_rate"]);
  const inflationFactor = getInflationFactor(year, inflationRate);

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

function applyDynamicCarToExpenseDf(expenseDf: Row[], index: number, carResult: CarResult): void {
  const row = expenseDf[index];

  row["Car Purchase Cost"] = pyround(carResult.car_purchase_cost, 2);
  row["Car Running Cost"] = pyround(carResult.car_annual_running_cost, 2);
  row["Car Cost"] = pyround(carResult.car_total_cost, 2);
  row["Car Value"] = pyround(carResult.car_value, 2);

  const oldTotalExpenses = Number(row["Total Expenses"]);
  row["Total Expenses"] = pyround(oldTotalExpenses + carResult.car_total_cost, 2);
}

function applyDebtCostToExpenseDf(expenseDf: Row[], index: number, interestPaid: number): void {
  const row = expenseDf[index];

  const oldDebtCost = Number(row["Debt Cost"] ?? 0.0);
  const oldTotalExpenses = Number(row["Total Expenses"]);

  row["Debt Cost"] = pyround(interestPaid, 2);
  row["Total Expenses"] = pyround(oldTotalExpenses - oldDebtCost + interestPaid, 2);
}

function calculateDebtToIncomeRatio(totalDebt: number, grossIncome: number): number {
  if (grossIncome <= 0) return 0.0;
  return totalDebt / grossIncome;
}

function calculateWeightedDebtInterestRate(openingTotalDebt: number, interestPaid: number): number {
  if (openingTotalDebt <= 0) return 0.0;
  return interestPaid / openingTotalDebt;
}

/**
 * Core NAV engine. Mutates expenseDf in place (debt cost + dynamic car),
 * exactly like the Python model — createFinalSimulationTable depends on it.
 */
export function calculateNavSimulation(
  dataset: Dataset,
  scenarioConfig: ScenarioConfig,
  incomeDf: Row[],
  expenseDf: Row[]
): Row[] {
  const localCurrency = getCountryCurrency(dataset);
  const exchangeRateToLkr = getExchangeRateToLkr(dataset);
  const toLkr = (amount: number) => amount * exchangeRateToLkr;

  const savingsInterestRate = Number(
    getValue(dataset, "investment_and_economy.savings_interest_rate.value")
  );
  const investmentReturnRate = Number(
    scenarioConfig["adjustable_inputs"]["investment_return_rate"]
  );

  const debtInterestRates = getDebtInterestRates(dataset);

  const educationLoanInterestRate = debtInterestRates["education_debt"];
  const migrationLoanInterestRate = debtInterestRates["migration_debt"];
  const carLoanInterestRate = debtInterestRates["car_loan_debt"];
  const negativeCashInterestRate = debtInterestRates["negative_cash_debt"];

  const investmentSettings = scenarioConfig["investment_settings"] ?? {};
  const investmentMethod = investmentSettings["method"] ?? "save_only";

  let investmentPercentage = Number(
    investmentSettings["investment_percentage"] ??
      (investmentMethod === "invest_positive_cash_flow" ? 1.0 : 0.0)
  );
  investmentPercentage = Math.max(0.0, Math.min(investmentPercentage, 1.0));

  const overrides = getScenarioOverrides(scenarioConfig);
  const dynamicCarEnabled = Boolean(overrides["car_purchase_after_positive_cash_flow"] ?? false);

  let dynamicCarPurchased = false;
  let dynamicCarPurchaseYear: number | null = null;

  let cashSavingsBalance = 0.0;
  let investmentBalance = 0.0;
  let superannuationBalance = 0.0;

  let educationDebt = 0.0;
  let migrationDebt = 0.0;
  let carLoanDebt = 0.0;
  let negativeCashDebt = 0.0;

  const records: Row[] = [];

  for (let index = 0; index < incomeDf.length; index++) {
    const incomeRow = incomeDf[index];
    let expenseRow = expenseDf[index];

    const year = Math.trunc(Number(incomeRow["Year"]));

    const grossIncome = Number(incomeRow["Gross Income"] ?? incomeRow["Net Income"]);
    const netIncome = Number(incomeRow["Net Income"]);
    const yearlySuperannuation = Number(incomeRow["Superannuation"]);

    let totalExpenses = Number(expenseRow["Total Expenses"]);
    let carValue = Number(expenseRow["Car Value"]);

    if (dynamicCarEnabled) {
      const preCarCashFlow = netIncome - totalExpenses;

      if (!dynamicCarPurchased && preCarCashFlow > 0) {
        dynamicCarPurchased = true;
        dynamicCarPurchaseYear = year;
      }

      if (dynamicCarPurchased && dynamicCarPurchaseYear !== null) {
        const carResult = calculateDynamicCarExpenseAndValue(
          dataset,
          scenarioConfig,
          year,
          dynamicCarPurchaseYear
        );

        applyDynamicCarToExpenseDf(expenseDf, index, carResult);

        totalExpenses = Number(expenseDf[index]["Total Expenses"]);
        carValue = Number(expenseDf[index]["Car Value"]);
        expenseRow = expenseDf[index];
      }
    }

    const debtBalancesBeforeInterest = {
      education_debt: educationDebt,
      migration_debt: migrationDebt,
      car_loan_debt: carLoanDebt,
      negative_cash_debt: negativeCashDebt,
    };

    const openingTotalDebt = calculateTotalLiabilities(
      educationDebt,
      migrationDebt,
      carLoanDebt,
      negativeCashDebt
    );

    const [interestCosts, interestPaid] = calculateDebtInterestCosts(
      debtBalancesBeforeInterest,
      debtInterestRates
    );

    applyDebtCostToExpenseDf(expenseDf, index, interestPaid);

    totalExpenses = Number(expenseDf[index]["Total Expenses"]);
    expenseRow = expenseDf[index];

    cashSavingsBalance = cashSavingsBalance * (1 + savingsInterestRate);
    investmentBalance = investmentBalance * (1 + investmentReturnRate);
    superannuationBalance += yearlySuperannuation;

    const cashFlow = netIncome - totalExpenses;

    let positiveCashFlow = 0.0;
    let cashShortage = 0.0;

    let amountAddedToSavings = 0.0;
    let amountAddedToInvestment = 0.0;

    let educationDebtAdded = 0.0;
    let migrationDebtAdded = 0.0;
    let carLoanDebtAdded = 0.0;
    let negativeCashDebtAdded = 0.0;

    let educationDebtRepaid = 0.0;
    let migrationDebtRepaid = 0.0;
    let carLoanDebtRepaid = 0.0;
    let negativeCashDebtRepaid = 0.0;

    let debtRepayment = 0.0;
    let netCashAfterDebtRepayment = 0.0;

    if (cashFlow >= 0) {
      positiveCashFlow = cashFlow;

      const [debtBalancesAfterRepayment, repayments, totalRepayment, remainingCash] =
        repayDebtsWithPositiveCashFlow(
          positiveCashFlow,
          {
            education_debt: educationDebt,
            migration_debt: migrationDebt,
            car_loan_debt: carLoanDebt,
            negative_cash_debt: negativeCashDebt,
          },
          debtInterestRates
        );

      debtRepayment = totalRepayment;

      educationDebt = debtBalancesAfterRepayment["education_debt"];
      migrationDebt = debtBalancesAfterRepayment["migration_debt"];
      carLoanDebt = debtBalancesAfterRepayment["car_loan_debt"];
      negativeCashDebt = debtBalancesAfterRepayment["negative_cash_debt"];

      educationDebtRepaid = repayments["education_debt"];
      migrationDebtRepaid = repayments["migration_debt"];
      carLoanDebtRepaid = repayments["car_loan_debt"];
      negativeCashDebtRepaid = repayments["negative_cash_debt"];

      netCashAfterDebtRepayment = remainingCash;

      amountAddedToInvestment = remainingCash * investmentPercentage;
      amountAddedToSavings = remainingCash - amountAddedToInvestment;

      investmentBalance += amountAddedToInvestment;
      cashSavingsBalance += amountAddedToSavings;
    } else {
      cashShortage = Math.abs(cashFlow);

      const debtAdditions = allocateCashShortageToDebtCategories(cashShortage, expenseRow);

      educationDebtAdded = debtAdditions["education_debt"];
      migrationDebtAdded = debtAdditions["migration_debt"];
      carLoanDebtAdded = debtAdditions["car_loan_debt"];
      negativeCashDebtAdded = debtAdditions["negative_cash_debt"];

      educationDebt = calculateEducationDebt(educationDebt, educationDebtAdded);
      migrationDebt = calculateMigrationDebt(migrationDebt, migrationDebtAdded);
      carLoanDebt = calculateCarLoanDebt(carLoanDebt, carLoanDebtAdded);
      negativeCashDebt = calculateNegativeCashDebt(negativeCashDebt, negativeCashDebtAdded);
    }

    const totalAssets = cashSavingsBalance + investmentBalance + superannuationBalance + carValue;

    const totalDebt = calculateTotalLiabilities(
      educationDebt,
      migrationDebt,
      carLoanDebt,
      negativeCashDebt
    );

    const totalLiabilities = totalDebt;
    const nav = totalAssets - totalLiabilities;

    const debtToIncomeRatio = calculateDebtToIncomeRatio(totalDebt, grossIncome);
    const weightedDebtInterestRate = calculateWeightedDebtInterestRate(
      openingTotalDebt,
      interestPaid
    );

    records.push({
      Year: year,
      Currency: localCurrency,
      "Exchange Rate to LKR": pyround(exchangeRateToLkr, 4),

      "Gross Income": pyround(grossIncome, 2),
      "Net Income": pyround(netIncome, 2),
      "Total Expenses": pyround(totalExpenses, 2),
      "Cash Flow": pyround(cashFlow, 2),
      "Positive Cash Flow": pyround(positiveCashFlow, 2),
      "Cash Shortage": pyround(cashShortage, 2),

      "Local Currency Cash Flow": pyround(cashFlow, 2),
      "LKR Cash Flow": pyround(toLkr(cashFlow), 2),

      "Amount Added To Savings": pyround(amountAddedToSavings, 2),
      "Amount Added To Investment": pyround(amountAddedToInvestment, 2),
      "Investment Percentage": pyround(investmentPercentage, 4),

      "Debt Repayment": pyround(debtRepayment, 2),
      "Net Cash After Debt Repayment": pyround(netCashAfterDebtRepayment, 2),

      "Education Debt Added": pyround(educationDebtAdded, 2),
      "Migration Debt Added": pyround(migrationDebtAdded, 2),
      "Car Loan Debt Added": pyround(carLoanDebtAdded, 2),
      "Negative Cash Debt Added": pyround(negativeCashDebtAdded, 2),

      "Education Debt Repaid": pyround(educationDebtRepaid, 2),
      "Migration Debt Repaid": pyround(migrationDebtRepaid, 2),
      "Car Loan Debt Repaid": pyround(carLoanDebtRepaid, 2),
      "Negative Cash Debt Repaid": pyround(negativeCashDebtRepaid, 2),

      "Cash Savings Balance": pyround(cashSavingsBalance, 2),
      "Investment Balance": pyround(investmentBalance, 2),
      "Superannuation Balance": pyround(superannuationBalance, 2),
      "Car Value": pyround(carValue, 2),

      "Total Assets": pyround(totalAssets, 2),
      "Local Currency Assets": pyround(totalAssets, 2),
      "LKR Assets": pyround(toLkr(totalAssets), 2),

      "Education Debt": pyround(educationDebt, 2),
      "Migration Debt": pyround(migrationDebt, 2),
      "Car Loan Debt": pyround(carLoanDebt, 2),
      "Negative Cash Debt": pyround(negativeCashDebt, 2),

      "Total Debt": pyround(totalDebt, 2),
      "Local Currency Debt": pyround(totalDebt, 2),
      "LKR Debt": pyround(toLkr(totalDebt), 2),

      "Total Liabilities": pyround(totalLiabilities, 2),
      "Local Currency Liabilities": pyround(totalLiabilities, 2),
      "LKR Liabilities": pyround(toLkr(totalLiabilities), 2),

      NAV: pyround(nav, 2),
      "Local Currency NAV": pyround(nav, 2),
      "LKR NAV": pyround(toLkr(nav), 2),

      "Interest Paid": pyround(interestPaid, 2),
      "Education Debt Interest": pyround(interestCosts["education_debt"], 2),
      "Migration Debt Interest": pyround(interestCosts["migration_debt"], 2),
      "Car Loan Debt Interest": pyround(interestCosts["car_loan_debt"], 2),
      "Negative Cash Debt Interest": pyround(interestCosts["negative_cash_debt"], 2),
      "Debt-to-Income Ratio": pyround(debtToIncomeRatio, 4),

      "Savings Interest Rate": pyround(savingsInterestRate, 4),
      "Investment Return Rate": pyround(investmentReturnRate, 4),
      "Debt Interest Rate": pyround(weightedDebtInterestRate, 4),
      "Education Loan Interest Rate": pyround(educationLoanInterestRate, 4),
      "Migration Loan Interest Rate": pyround(migrationLoanInterestRate, 4),
      "Car Loan Interest Rate": pyround(carLoanInterestRate, 4),
      "Negative Cash Interest Rate": pyround(negativeCashInterestRate, 4),

      "Dynamic Car Enabled": dynamicCarEnabled,
      "Dynamic Car Purchase Year": dynamicCarPurchaseYear,
    });
  }

  return records;
}

export function getNavSummary(navDf: Row[]): Record<string, any> {
  const finalRow = navDf[navDf.length - 1];

  const navColumn = "Local Currency NAV" in finalRow ? "Local Currency NAV" : "NAV";
  const assetsColumn = "Local Currency Assets" in finalRow ? "Local Currency Assets" : "Total Assets";
  const debtColumn = "Local Currency Debt" in finalRow ? "Local Currency Debt" : "Total Debt";
  const liabilitiesColumn =
    "Local Currency Liabilities" in finalRow ? "Local Currency Liabilities" : "Total Liabilities";

  const breakEvenRow = navDf.find((row) => Number(row[navColumn]) >= 0);
  const breakEvenYear = breakEvenRow ? Math.trunc(Number(breakEvenRow["Year"])) : null;

  // First occurrence wins, same as pandas idxmax/idxmin.
  const firstMaxBy = (column: string) =>
    navDf.reduce((best, row) => (Number(row[column]) > Number(best[column]) ? row : best));
  const firstMinBy = (column: string) =>
    navDf.reduce((best, row) => (Number(row[column]) < Number(best[column]) ? row : best));

  const highestDebtRow = firstMaxBy(debtColumn);
  const lowestNavRow = firstMinBy(navColumn);

  const sum = (column: string) => navDf.reduce((total, row) => total + Number(row[column]), 0);

  return {
    currency: String(finalRow["Currency"] ?? "LOCAL"),
    exchange_rate_to_lkr: Number(finalRow["Exchange Rate to LKR"] ?? 1.0),

    year_10_nav: Number(finalRow[navColumn]),
    year_10_nav_lkr: Number(finalRow["LKR NAV"] ?? finalRow[navColumn]),

    year_10_total_assets: Number(finalRow[assetsColumn]),
    year_10_total_assets_lkr: Number(finalRow["LKR Assets"] ?? finalRow[assetsColumn]),

    year_10_total_liabilities: Number(finalRow[liabilitiesColumn]),
    year_10_total_liabilities_lkr: Number(
      finalRow["LKR Liabilities"] ?? finalRow[liabilitiesColumn]
    ),

    year_10_total_debt: Number(finalRow[debtColumn]),
    year_10_total_debt_lkr: Number(finalRow["LKR Debt"] ?? finalRow[debtColumn]),

    year_10_cash_savings: Number(finalRow["Cash Savings Balance"]),
    year_10_investment_balance: Number(finalRow["Investment Balance"]),
    year_10_superannuation_balance: Number(finalRow["Superannuation Balance"]),
    year_10_car_value: Number(finalRow["Car Value"]),

    year_10_education_debt: Number(finalRow["Education Debt"]),
    year_10_migration_debt: Number(finalRow["Migration Debt"]),
    year_10_car_loan_debt: Number(finalRow["Car Loan Debt"]),
    year_10_negative_cash_debt: Number(finalRow["Negative Cash Debt"]),
    year_10_debt_to_income_ratio: Number(finalRow["Debt-to-Income Ratio"]),

    total_positive_cash_flow: sum("Positive Cash Flow"),
    total_cash_shortage: sum("Cash Shortage"),
    total_interest_paid: sum("Interest Paid"),
    total_debt_repayment: sum("Debt Repayment"),

    break_even_year: breakEvenYear,

    highest_debt_year: Math.trunc(Number(highestDebtRow["Year"])),
    highest_debt_amount: Number(highestDebtRow[debtColumn]),
    highest_debt_amount_lkr: Number(highestDebtRow["LKR Debt"] ?? highestDebtRow[debtColumn]),
    highest_debt_to_income_ratio: Number(highestDebtRow["Debt-to-Income Ratio"]),

    lowest_nav_year: Math.trunc(Number(lowestNavRow["Year"])),
    lowest_nav_amount: Number(lowestNavRow[navColumn]),
    lowest_nav_amount_lkr: Number(lowestNavRow["LKR NAV"] ?? lowestNavRow[navColumn]),
  };
}

/** Reads expense "Debt Cost" AFTER the nav simulation mutated it. */
export function createFinalSimulationTable(
  incomeDf: Row[],
  expenseDf: Row[],
  navDf: Row[]
): Row[] {
  return navDf.map((navRow, index) => ({
    Year: navRow["Year"],
    Currency: navRow["Currency"] ?? "LOCAL",

    "Gross Income": incomeDf[index]["Gross Income"],
    "Net Income": navRow["Net Income"],
    Expenses: navRow["Total Expenses"],
    "Debt Cost": expenseDf[index]["Debt Cost"],
    "Interest Paid": navRow["Interest Paid"],

    "Local Currency Cash Flow": navRow["Local Currency Cash Flow"],
    "LKR Cash Flow": navRow["LKR Cash Flow"],

    "Debt Repayment": navRow["Debt Repayment"],

    "Education Debt": navRow["Education Debt"],
    "Migration Debt": navRow["Migration Debt"],
    "Car Loan Debt": navRow["Car Loan Debt"],
    "Negative Cash Debt": navRow["Negative Cash Debt"],

    "Local Currency Debt": navRow["Local Currency Debt"],
    "LKR Debt": navRow["LKR Debt"],

    "Debt-to-Income Ratio": navRow["Debt-to-Income Ratio"],

    "Local Currency Assets": navRow["Local Currency Assets"],
    "LKR Assets": navRow["LKR Assets"],

    "Local Currency Liabilities": navRow["Local Currency Liabilities"],
    "LKR Liabilities": navRow["LKR Liabilities"],

    "Local Currency NAV": navRow["Local Currency NAV"],
    "LKR NAV": navRow["LKR NAV"],
  }));
}
