// Shared dataset access helpers (Python duplicated get_value in ~6 modules).
export type Dataset = Record<string, any>;
export type ScenarioConfig = Record<string, any>;
export type Row = Record<string, any>;

/** Strict dot-path read; throws like Python's dataset[key] chain. */
export function getValue(dataset: Dataset, path: string): any {
  let current: any = dataset;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      throw new Error(`Missing dataset key: ${path}`);
    }
    current = current[key];
  }
  return current;
}

/** Lenient dot-path read with default (Python get_nested_value / get_optional_value). */
export function getNestedValue(dataset: Dataset, path: string, defaultValue: any = null): any {
  let current: any = dataset;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }
  return current;
}

/** Numeric variant used by debt_model.get_optional_value. */
export function getOptionalNumber(dataset: Dataset, path: string, defaultValue: number): number {
  const value = getNestedValue(dataset, path, null);
  const parsed = Number(value);
  return value === null || Number.isNaN(parsed) ? defaultValue : parsed;
}

export interface CountryRegistryEntry {
  name: string;
  code: string;
  currency: string;
  dataset_path: string;
  enabled: boolean;
  sort_order?: number;
}

export function getCountryRecords(registry: {
  countries?: CountryRegistryEntry[];
  default_country?: string;
}): CountryRegistryEntry[] {
  return (registry.countries ?? [])
    .filter((entry) => entry.enabled === true)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
}
