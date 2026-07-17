# GoldenPath

GoldenPath is an Expo / React Native app that models the long-term financial
outcome of relocating to another country. You pick a destination, describe your
scenario (visa route, family, education, income level, debts), and the app
simulates your net asset value (NAV) year by year — then compares countries so
you can see where you'd come out ahead.

## What it does

- **Net-worth simulation** — projects income, expenses, and NAV over a multi-year
  horizon for a chosen country and scenario.
- **Country comparison** — runs the same scenario across every supported country
  and ranks the results in a common currency (LKR).
- **Sensitivity & risk** — identifies the variable your outcome is most sensitive
  to, and gives best-/worst-case NAV bounds with a risk rating.
- **Dataset validation** — every country dataset is checked before it can be
  simulated. If a value is in the wrong currency (or otherwise inconsistent), the
  dataset is flagged as unsafe and blocked rather than producing wrong numbers.

Supported countries: USA, Japan, Canada, Germany, Australia, New Zealand,
Singapore, and Sri Lanka.

## App structure

The UI is a five-tab flow (Expo Router file-based routing under `app/(tabs)/`):

| Tab | Purpose |
|-----|---------|
| **Setup** | Choose country and scenario inputs |
| **Dashboard** | NAV projection and summary for the selected country |
| **Details** | Year-by-year income / expense / NAV tables |
| **Compare** | Ranked comparison across all countries |
| **Risk** | Sensitivity analysis and risk rating |

Key folders:

- `core/` — the simulation engine (income, expense, NAV, comparison, sensitivity,
  risk models) plus dataset loading, currency conversion, and validation.
- `data/` — one `*_dataset.json` per country, and `country_registry.json`.
- `context/` — shared simulation state provider.

## Get started

```bash
npm install
npx expo start
```

From the Expo output you can open the app in an Android emulator, iOS simulator,
[Expo Go](https://expo.dev/go), or the web.

## Scripts

```bash
npm run android   # start on Android
npm run ios       # start on iOS
npm run web       # start in the browser
npm run lint      # expo lint
npm run parity    # typecheck + run the parity test suite
```

## Datasets

Each country's economic figures live in `data/<country>_dataset.json`.
