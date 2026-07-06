# Mt Hutt Powder Map

A free, static web app for exploring Mt Hutt as a 3D ski map with trails, lifts, weather, and an experimental powder estimate overlay.

## Run Locally

```bash
npm install
npm run generate:data
npm run dev
```

## Update Weather

```bash
npm run update:data
```

The updater calls Open-Meteo, writes `public/data/latest.json`, and rebuilds the powder grid. GitHub Actions can run this every six hours so the public app refreshes when visitors reload after an update.

## Deploy

Push to GitHub, enable GitHub Pages for Actions, then run the `Deploy` workflow or push to `main`.

## Data Notes

The current terrain and trail files are a working MVP dataset shaped around Mt Hutt. Replace `public/data/terrain.json` with a simplified mesh from LINZ/NZ elevation data, and refine `public/data/trails.geojson` against the official Mt Hutt/NZSki trail map for better accuracy.

## Attribution

- Weather data: Open-Meteo.
- Elevation replacement target: LINZ / Toitu Te Whenua open elevation data.
- Trail data replacement target: OpenStreetMap/OpenSkiMap where available, with ODbL attribution.
- Official Mt Hutt/NZSki trail map should be used only as a visual reference unless permission/licensing allows more.

## Safety

This app is a recreational estimate only. It does not assess avalanche risk, closures, patrol status, or whether terrain is safe to ski.
