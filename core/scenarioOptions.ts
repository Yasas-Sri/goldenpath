// Option labels must match the Python app byte-for-byte (curly apostrophe ’).

export const EDUCATION_MODE_OPTIONS = [
  "No further study",
  "Master’s full-time",
  "Master’s part-time",
  "MBA full-time",
  "MBA part-time",
];

export const PR_TIMING_OPTIONS = [
  "No PR within 10 years",
  "Early PR",
  "Normal PR",
  "Late PR",
  "Custom PR year",
];

export const CAR_PURCHASE_TIMING_OPTIONS = [
  "No car",
  "Buy car in Year 2",
  "Buy car in Year 3",
  "Buy car in Year 5",
  "Buy car after positive cash flow",
];

export const FIRST_CHILD_TIMING_OPTIONS = [
  "Dataset default",
  "First child Year 5",
  "First child Year 7",
  "First child Year 9",
  "No child",
];

export const SECOND_CHILD_TIMING_OPTIONS = [
  "Dataset default",
  "Second child Year 9",
  "No second child",
];

export const INVESTMENT_SPLIT_OPTIONS = [
  "Save only",
  "Invest 25% of positive cash flow",
  "Invest 50%",
  "Invest 75%",
  "Invest 100%",
];

export function resolveEducationMode(educationModeLabel: string | null): Record<string, any> {
  if (educationModeLabel == null) {
    return {
      education_override_enabled: false,
      education_mode: "Dataset default",
      education_program: null,
      education_study_mode: null,
      education_study_years: null,
      tuition_load: null,
    };
  }

  if (educationModeLabel === "No further study") {
    return {
      education_override_enabled: true,
      education_mode: educationModeLabel,
      education_program: null,
      education_study_mode: "none",
      education_study_years: [],
      tuition_load: 0.0,
    };
  }

  if (educationModeLabel === "Master’s full-time") {
    return {
      education_override_enabled: true,
      education_mode: educationModeLabel,
      education_program: "masters",
      education_study_mode: "full_time",
      education_study_years: [1, 2],
      tuition_load: 1.0,
    };
  }

  if (educationModeLabel === "Master’s part-time") {
    return {
      education_override_enabled: true,
      education_mode: educationModeLabel,
      education_program: "masters",
      education_study_mode: "part_time",
      education_study_years: [1, 2, 3, 4],
      tuition_load: 0.5,
    };
  }

  if (educationModeLabel === "MBA full-time") {
    return {
      education_override_enabled: true,
      education_mode: educationModeLabel,
      education_program: "mba",
      education_study_mode: "full_time",
      education_study_years: [1, 2],
      tuition_load: 1.0,
    };
  }

  if (educationModeLabel === "MBA part-time") {
    return {
      education_override_enabled: true,
      education_mode: educationModeLabel,
      education_program: "mba",
      education_study_mode: "part_time",
      education_study_years: [1, 2, 3, 4],
      tuition_load: 0.5,
    };
  }

  throw new Error(`Unknown education mode: ${educationModeLabel}`);
}

export function resolvePrApplicationYear(
  prTimingLabel: string | null,
  migrationPathKey: string,
  customPrYear: number | null = null
): Record<string, any> {
  if (prTimingLabel == null) {
    return {
      pr_override_enabled: false,
      pr_timing: "Dataset default",
      pr_application_year: null,
    };
  }

  if (prTimingLabel === "No PR within 10 years") {
    return {
      pr_override_enabled: true,
      pr_timing: prTimingLabel,
      pr_application_year: null,
    };
  }

  let prYear: number;

  if (prTimingLabel === "Early PR") {
    prYear = migrationPathKey === "student_visa_path" ? 5 : 3;
  } else if (prTimingLabel === "Normal PR") {
    prYear = migrationPathKey === "student_visa_path" ? 6 : 4;
  } else if (prTimingLabel === "Late PR") {
    prYear = migrationPathKey === "student_visa_path" ? 8 : 6;
  } else if (prTimingLabel === "Custom PR year") {
    if (customPrYear == null) {
      throw new Error("Custom PR year was selected, but no custom_pr_year was provided.");
    }
    prYear = Math.trunc(Number(customPrYear));
    if (prYear < 1 || prYear > 10) {
      throw new Error("Custom PR year must be between Year 1 and Year 10.");
    }
  } else {
    throw new Error(`Unknown PR timing option: ${prTimingLabel}`);
  }

  return {
    pr_override_enabled: true,
    pr_timing: prTimingLabel,
    pr_application_year: prYear,
  };
}

export function resolveCarPurchaseTiming(
  carPurchaseTimingLabel: string | null
): Record<string, any> {
  if (carPurchaseTimingLabel == null) {
    return {
      car_timing_override_enabled: false,
      buy_car: null,
      car_purchase_year: null,
      car_purchase_after_positive_cash_flow: false,
    };
  }

  if (carPurchaseTimingLabel === "No car") {
    return {
      car_timing_override_enabled: true,
      buy_car: false,
      car_purchase_year: null,
      car_purchase_after_positive_cash_flow: false,
    };
  }

  const fixedYears: Record<string, number> = {
    "Buy car in Year 2": 2,
    "Buy car in Year 3": 3,
    "Buy car in Year 5": 5,
  };

  if (carPurchaseTimingLabel in fixedYears) {
    return {
      car_timing_override_enabled: true,
      buy_car: true,
      car_purchase_year: fixedYears[carPurchaseTimingLabel],
      car_purchase_after_positive_cash_flow: false,
    };
  }

  if (carPurchaseTimingLabel === "Buy car after positive cash flow") {
    return {
      car_timing_override_enabled: true,
      buy_car: true,
      car_purchase_year: null,
      car_purchase_after_positive_cash_flow: true,
    };
  }

  throw new Error(`Unknown car purchase timing: ${carPurchaseTimingLabel}`);
}

export function resolveChildTiming(
  firstChildTimingLabel: string | null,
  secondChildTimingLabel: string | null
): Record<string, any> {
  const firstOverrideEnabled =
    firstChildTimingLabel != null && firstChildTimingLabel !== "Dataset default";

  let secondOverrideEnabled =
    secondChildTimingLabel != null && secondChildTimingLabel !== "Dataset default";

  let firstChildYearOverride: number | null = null;
  let secondChildYearOverride: number | null = null;

  if (firstChildTimingLabel === "First child Year 5") {
    firstChildYearOverride = 5;
  } else if (firstChildTimingLabel === "First child Year 7") {
    firstChildYearOverride = 7;
  } else if (firstChildTimingLabel === "First child Year 9") {
    firstChildYearOverride = 9;
  } else if (firstChildTimingLabel === "No child") {
    firstChildYearOverride = null;
    secondOverrideEnabled = true;
    secondChildYearOverride = null;
  } else if (firstChildTimingLabel == null || firstChildTimingLabel === "Dataset default") {
    // keep dataset timing
  } else {
    throw new Error(`Unknown first child timing: ${firstChildTimingLabel}`);
  }

  if (firstChildTimingLabel !== "No child") {
    if (secondChildTimingLabel === "Second child Year 9") {
      secondChildYearOverride = 9;
    } else if (secondChildTimingLabel === "No second child") {
      secondChildYearOverride = null;
    } else if (secondChildTimingLabel == null || secondChildTimingLabel === "Dataset default") {
      // keep dataset timing
    } else {
      throw new Error(`Unknown second child timing: ${secondChildTimingLabel}`);
    }
  }

  return {
    first_child_override_enabled: firstOverrideEnabled,
    first_child_year_override: firstChildYearOverride,
    second_child_override_enabled: secondOverrideEnabled,
    second_child_year_override: secondChildYearOverride,
  };
}

export function resolveInvestmentSplit(
  investmentSplitLabel: string | null,
  oldInvestmentMethod: string
): Record<string, any> {
  if (investmentSplitLabel == null) {
    if (oldInvestmentMethod === "invest_positive_cash_flow") {
      return { investment_split: "Invest 100%", investment_percentage: 1.0 };
    }
    return { investment_split: "Save only", investment_percentage: 0.0 };
  }

  const mapping: Record<string, number> = {
    "Save only": 0.0,
    "Invest 25% of positive cash flow": 0.25,
    "Invest 50%": 0.5,
    "Invest 75%": 0.75,
    "Invest 100%": 1.0,
  };

  if (!(investmentSplitLabel in mapping)) {
    throw new Error(`Unknown investment split: ${investmentSplitLabel}`);
  }

  return {
    investment_split: investmentSplitLabel,
    investment_percentage: mapping[investmentSplitLabel],
  };
}
