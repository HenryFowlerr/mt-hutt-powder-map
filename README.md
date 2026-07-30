# Hutt Powder

A map-first snow intelligence app for exploring Mt Hutt in 3D with trails, lifts, weather, wind
loading, and an experimental powder estimate overlay.

The interface and visual-system rules are documented in [`DESIGN.md`](./DESIGN.md).

## Run Locally

```bash
npm install
npm run dev
```

Real terrain, trail, and weather data is committed in `public/data/`, so the app works straight from a fresh clone.

```bash
npm run lint
npm run build
npm run test:model
```

The model regression checks cover zero snow, light-event visibility, storm-depth scaling, warm/rain
degradation, and wind-direction loading.

## Update Weather

```bash
npm run update:data
```

The updater calls Open-Meteo, writes `public/data/latest.json` (summary, 14-day daily forecast, hourly series, powder polygons), and never overwrites good data with a failed fetch. GitHub Actions runs this every six hours so the public app refreshes itself.

## Deploy

Push to GitHub, enable GitHub Pages for Actions, then run the `Deploy` workflow or push to `main`.

## Data Notes

- `public/data/terrain.json`: 240x280 DEM (~31 m cells) from OpenTopoData `nzdem8m` (LINZ 8 m). Static; refetch manually with `npm run fetch:terrain` if ever needed.
- `public/data/trails.geojson`: OSM runs/lifts/boundary (cached; `npm run fetch:trails` to refresh), with official-map name/difficulty corrections applied at runtime.
- `public/data/map-overrides.geojson`: base-area carparks and buildings from OSM (`npx tsx scripts/fetch-map-details.ts` to refresh).
- `public/data/latest.json`: the only file the scheduled updater touches. Cached terrain contours
  are intentionally compact; the browser renders the full-resolution field from the summary.

## Attribution

- Weather data: Open-Meteo.
- Weather state artwork: [Meteocons](https://meteocons.com/) by Bas Milius, MIT licensed.
- Elevation replacement target: LINZ / Toitu Te Whenua open elevation data.
- Trail data replacement target: OpenStreetMap/OpenSkiMap where available, with ODbL attribution.
- Official Mt Hutt/NZSki trail map should be used only as a visual reference unless permission/licensing allows more.

## Safety

This app is a recreational estimate only. It does not assess avalanche risk, closures, patrol status, or whether terrain is safe to ski.
