// Bundled country datasets (Metro inlines JSON imports; fully offline).
import registry from "../data/country_registry.json";
import australia from "../data/australia_dataset.json";
import newzealand from "../data/newzeland_dataset.json";
import germany from "../data/germany_dataset.json";
import canada from "../data/canada_dataset.json";
import singapore from "../data/singapore_dataset.json";
import japan from "../data/japan_dataset.json";
import usa from "../data/usa_dataset.json";
import sriLanka from "../data/sri_lanka_dataset.json";

import { Dataset, getCountryRecords } from "./dataset";
import { CountryDataset } from "./countryComparison";

const DATASETS_BY_PATH: Record<string, Dataset> = {
  "data/australia_dataset.json": australia,
  "data/newzeland_dataset.json": newzealand,
  "data/germany_dataset.json": germany,
  "data/canada_dataset.json": canada,
  "data/singapore_dataset.json": singapore,
  "data/japan_dataset.json": japan,
  "data/usa_dataset.json": usa,
  "data/sri_lanka_dataset.json": sriLanka,
};

export const DEFAULT_COUNTRY: string = (registry as any).default_country ?? "Australia";

export const COUNTRIES = getCountryRecords(registry as any).filter(
  (entry) => entry.dataset_path in DATASETS_BY_PATH
);

export function getDatasetForCountry(countryName: string): Dataset {
  const entry = COUNTRIES.find((country) => country.name === countryName);
  if (!entry) throw new Error(`Unknown country: ${countryName}`);
  return DATASETS_BY_PATH[entry.dataset_path];
}

export function getAllCountryDatasets(): CountryDataset[] {
  return COUNTRIES.map((entry) => ({
    name: entry.name,
    currency: entry.currency,
    dataset: DATASETS_BY_PATH[entry.dataset_path],
  }));
}
