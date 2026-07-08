import { Dataset, Row, ScenarioConfig, getValue } from "./dataset";
import { getCountryCurrency } from "./currency";
import { pyround } from "./pyround";

export function getBaseSalaryForYear(
  year: number,
  graduateSalary: number,
  midLevelSalary: number,
  seniorSalary: number
): number {
  if (year >= 1 && year <= 3) return graduateSalary;
  if (year >= 4 && year <= 7) return midLevelSalary;
  return seniorSalary;
}

export function applySalaryGrowth(baseSalary: number, year: number, salaryGrowthRate: number): number {
  return baseSalary * (1 + salaryGrowthRate) ** (year - 1);
}

export function calculateStudentPartTimeIncome(
  hourlyWage: number,
  legalWorkHoursPerWeek: number,
  workingWeeksPerYear: number
): number {
  return hourlyWage * legalWorkHoursPerWeek * workingWeeksPerYear;
}

export function calculateSpouseIncomeForYear(
  year: number,
  lifeScenarioDefaults: Record<string, any>,
  baseSpouseSalary: number,
  spouseIncomePercentage: number,
  salaryGrowthRate: number
): number {
  // Reads the raw dataset defaults, not the override-adjusted family model —
  // same as the Python income model.
  const marriageYear = lifeScenarioDefaults["marriage_year"];
  if (marriageYear == null) return 0.0;
  if (year < marriageYear) return 0.0;

  return applySalaryGrowth(baseSpouseSalary, year, salaryGrowthRate) * spouseIncomePercentage;
}

export function getCareerStageLabel(year: number): string {
  if (year >= 1 && year <= 3) return "Graduate / Junior";
  if (year >= 4 && year <= 7) return "Mid-level";
  return "Senior";
}

export function calculateYearlyIncome(dataset: Dataset, scenarioConfig: ScenarioConfig): Row[] {
  const localCurrency = getCountryCurrency(dataset);
  const timeHorizonYears = Math.trunc(Number(getValue(dataset, "metadata.time_horizon_years")));

  const graduateSalary = Number(
    getValue(dataset, "income.it_software_salary.graduate_annual_salary.value")
  );
  const midLevelSalary = Number(
    getValue(dataset, "income.it_software_salary.mid_level_annual_salary.value")
  );
  const seniorSalary = Number(
    getValue(dataset, "income.it_software_salary.senior_annual_salary.value")
  );

  const hourlyWage = Number(getValue(dataset, "income.student_part_time_work.hourly_wage.value"));
  const workingWeeksPerYear = Math.trunc(
    Number(getValue(dataset, "income.student_part_time_work.working_weeks_per_year.value"))
  );
  const legalWorkHoursPerWeek = Number(
    getValue(dataset, "visa.student_visa.legal_work_hours_per_week.value")
  );

  const baseSpouseSalary = Number(getValue(dataset, "income.spouse_income.annual_salary.value"));

  const effectiveTaxRate = Number(
    getValue(dataset, "tax_and_retirement.effective_income_tax_rate.value")
  );
  const superannuationRate = Number(
    getValue(dataset, "tax_and_retirement.employer_superannuation_rate.value")
  );

  const salaryGrowthRate = Number(scenarioConfig["adjustable_inputs"]["salary_growth_rate"]);

  const migrationPathKey = scenarioConfig["selected_keys"]["migration_path"];
  const migrationPathDefaults = scenarioConfig["migration_path_defaults"];
  const lifeScenarioDefaults = scenarioConfig["life_scenario_defaults"];

  const spouseIncomePercentage = Number(
    scenarioConfig["spouse_income_settings"]["income_percentage"]
  );

  const records: Row[] = [];

  for (let year = 1; year <= timeHorizonYears; year++) {
    const baseSalary = getBaseSalaryForYear(year, graduateSalary, midLevelSalary, seniorSalary);
    const grownFullTimeSalary = applySalaryGrowth(baseSalary, year, salaryGrowthRate);

    let studentPartTimeIncome = 0.0;
    let fullTimeEmploymentIncome = 0.0;
    let careerStage = "Not working full-time";

    if (migrationPathKey === "student_visa_path") {
      const studyYears: number[] = migrationPathDefaults["study_years"];
      const fullTimeWorkStartYear = migrationPathDefaults["full_time_work_start_year"];

      if (studyYears.includes(year)) {
        studentPartTimeIncome = calculateStudentPartTimeIncome(
          hourlyWage,
          legalWorkHoursPerWeek,
          workingWeeksPerYear
        );
        fullTimeEmploymentIncome = 0.0;
        careerStage = "Student / Part-time";
      } else if (year >= fullTimeWorkStartYear) {
        fullTimeEmploymentIncome = grownFullTimeSalary;
        careerStage = getCareerStageLabel(year);
      }
    } else if (migrationPathKey === "working_visa_path") {
      const fullTimeWorkStartYear = migrationPathDefaults["full_time_work_start_year"];

      if (year >= fullTimeWorkStartYear) {
        fullTimeEmploymentIncome = grownFullTimeSalary;
        careerStage = getCareerStageLabel(year);
      }
    }

    const spouseIncome = calculateSpouseIncomeForYear(
      year,
      lifeScenarioDefaults,
      baseSpouseSalary,
      spouseIncomePercentage,
      salaryGrowthRate
    );

    const grossIncome = studentPartTimeIncome + fullTimeEmploymentIncome + spouseIncome;
    const tax = grossIncome * effectiveTaxRate;
    const netIncome = grossIncome - tax;
    const superannuation = (fullTimeEmploymentIncome + spouseIncome) * superannuationRate;

    records.push({
      Year: year,
      Currency: localCurrency,
      "Career Stage": careerStage,
      "Student Part-Time Income": pyround(studentPartTimeIncome, 2),
      "Full-Time Employment Income": pyround(fullTimeEmploymentIncome, 2),
      "Spouse Income": pyround(spouseIncome, 2),
      "Gross Income": pyround(grossIncome, 2),
      Tax: pyround(tax, 2),
      "Net Income": pyround(netIncome, 2),
      Superannuation: pyround(superannuation, 2),
    });
  }

  return records;
}

export function getIncomeSummary(incomeDf: Row[]): Record<string, number> {
  const sum = (column: string) => incomeDf.reduce((total, row) => total + Number(row[column]), 0);
  const lastRow = incomeDf[incomeDf.length - 1];

  return {
    total_gross_income: sum("Gross Income"),
    total_tax: sum("Tax"),
    total_net_income: sum("Net Income"),
    total_superannuation: sum("Superannuation"),
    year_10_gross_income: Number(lastRow["Gross Income"]),
    year_10_net_income: Number(lastRow["Net Income"]),
  };
}
