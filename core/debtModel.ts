import { Dataset, Row, getOptionalNumber } from "./dataset";

export type DebtBalances = Record<string, number>;
export type DebtInterestRates = Record<string, number>;

export function calculateInterestForDebt(debtBalance: number, interestRate: number): number {
  if (debtBalance <= 0) return 0.0;
  if (interestRate <= 0) return 0.0;
  return debtBalance * interestRate;
}

export function calculateEducationDebt(currentDebt: number, tuitionShortage = 0.0, repayment = 0.0): number {
  return Math.max(currentDebt + tuitionShortage - repayment, 0.0);
}

export function calculateMigrationDebt(currentDebt: number, migrationShortage = 0.0, repayment = 0.0): number {
  return Math.max(currentDebt + migrationShortage - repayment, 0.0);
}

export function calculateCarLoanDebt(currentDebt: number, carPurchaseShortage = 0.0, repayment = 0.0): number {
  return Math.max(currentDebt + carPurchaseShortage - repayment, 0.0);
}

export function calculateNegativeCashDebt(currentDebt: number, generalLivingShortage = 0.0, repayment = 0.0): number {
  return Math.max(currentDebt + generalLivingShortage - repayment, 0.0);
}

export function calculateTotalLiabilities(
  educationDebt: number,
  migrationDebt: number,
  carLoanDebt: number,
  negativeCashDebt: number
): number {
  return educationDebt + migrationDebt + carLoanDebt + negativeCashDebt;
}

/** Cascading fallbacks: migration→education, car→migration, negative_cash→migration. */
export function getDebtInterestRates(dataset: Dataset): DebtInterestRates {
  const educationRate = getOptionalNumber(dataset, "loans_and_debt.education_loan_interest_rate.value", 0.0);
  const migrationRate = getOptionalNumber(dataset, "loans_and_debt.migration_loan_interest_rate.value", educationRate);
  const carLoanRate = getOptionalNumber(dataset, "loans_and_debt.car_loan_interest_rate.value", migrationRate);
  const negativeCashRate = getOptionalNumber(dataset, "loans_and_debt.negative_cash_interest_rate.value", migrationRate);

  return {
    education_debt: educationRate,
    migration_debt: migrationRate,
    car_loan_debt: carLoanRate,
    negative_cash_debt: negativeCashRate,
  };
}

export function calculateDebtInterestCosts(
  debtBalances: DebtBalances,
  interestRates: DebtInterestRates
): [DebtBalances, number] {
  const interestCosts: DebtBalances = {
    education_debt: calculateInterestForDebt(debtBalances["education_debt"] ?? 0.0, interestRates["education_debt"] ?? 0.0),
    migration_debt: calculateInterestForDebt(debtBalances["migration_debt"] ?? 0.0, interestRates["migration_debt"] ?? 0.0),
    car_loan_debt: calculateInterestForDebt(debtBalances["car_loan_debt"] ?? 0.0, interestRates["car_loan_debt"] ?? 0.0),
    negative_cash_debt: calculateInterestForDebt(debtBalances["negative_cash_debt"] ?? 0.0, interestRates["negative_cash_debt"] ?? 0.0),
  };

  const totalInterest = Object.values(interestCosts).reduce((sum, value) => sum + value, 0);
  return [interestCosts, totalInterest];
}

/**
 * Waterfall: tuition → education, visa → migration, car purchase → car_loan,
 * remainder → negative_cash.
 */
export function allocateCashShortageToDebtCategories(
  cashShortage: number,
  expenseRow: Row
): DebtBalances {
  let remainingShortage = Math.max(cashShortage, 0.0);

  const tuitionCost = Math.max(Number(expenseRow["Tuition"] ?? 0.0), 0.0);
  const visaCost = Math.max(Number(expenseRow["Visa Fees"] ?? 0.0), 0.0);
  const carPurchaseCost = Math.max(Number(expenseRow["Car Purchase Cost"] ?? 0.0), 0.0);

  const educationShortage = Math.min(remainingShortage, tuitionCost);
  remainingShortage -= educationShortage;

  const migrationShortage = Math.min(remainingShortage, visaCost);
  remainingShortage -= migrationShortage;

  const carPurchaseShortage = Math.min(remainingShortage, carPurchaseCost);
  remainingShortage -= carPurchaseShortage;

  return {
    education_debt: educationShortage,
    migration_debt: migrationShortage,
    car_loan_debt: carPurchaseShortage,
    negative_cash_debt: remainingShortage,
  };
}

/**
 * Repay highest-interest debt first. Stable sort keeps the insertion order
 * (education, migration, car_loan, negative_cash) for equal rates — same as
 * Python's stable sorted(reverse=True).
 */
export function repayDebtsWithPositiveCashFlow(
  availableCash: number,
  debtBalances: DebtBalances,
  interestRates: DebtInterestRates
): [DebtBalances, DebtBalances, number, number] {
  let remainingCash = Math.max(availableCash, 0.0);

  const updatedBalances: DebtBalances = {
    education_debt: Math.max(debtBalances["education_debt"] ?? 0.0, 0.0),
    migration_debt: Math.max(debtBalances["migration_debt"] ?? 0.0, 0.0),
    car_loan_debt: Math.max(debtBalances["car_loan_debt"] ?? 0.0, 0.0),
    negative_cash_debt: Math.max(debtBalances["negative_cash_debt"] ?? 0.0, 0.0),
  };

  const repayments: DebtBalances = {
    education_debt: 0.0,
    migration_debt: 0.0,
    car_loan_debt: 0.0,
    negative_cash_debt: 0.0,
  };

  const repaymentPriority = Object.keys(updatedBalances).sort(
    (a, b) => (interestRates[b] ?? 0.0) - (interestRates[a] ?? 0.0)
  );

  for (const debtKey of repaymentPriority) {
    if (remainingCash <= 0) break;

    const currentDebt = updatedBalances[debtKey];
    if (currentDebt <= 0) continue;

    const repaymentAmount = Math.min(remainingCash, currentDebt);
    updatedBalances[debtKey] -= repaymentAmount;
    repayments[debtKey] += repaymentAmount;
    remainingCash -= repaymentAmount;
  }

  const totalRepayment = Object.values(repayments).reduce((sum, value) => sum + value, 0);
  return [updatedBalances, repayments, totalRepayment, remainingCash];
}
