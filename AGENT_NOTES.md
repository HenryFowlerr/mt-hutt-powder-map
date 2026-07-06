# Agent Notes

## Active Branch
Fable is working on `fable-map-rebuild`.

## Goal
Rebuild the Mt Hutt map layers and powder model so the app looks like a real Mt Hutt ski map and gives useful terrain-aware powder estimates.

## Fable Owns
- Terrain rendering
- Terrain analysis
- Trail/lift map styling
- Label system
- Powder modelling
- Powder polygon rendering
- Map layer data/schema changes

## Codex Owns
- Deployment
- GitHub Actions
- Final review
- Integration into main
- Conflict resolution

## Do Not Merge
Do not merge this branch into `main`. Open a PR or leave the branch pushed for Codex to review.

## Data Schema Changes (Fable)
- `public/data/latest.json`: `powderGrid` (points) is removed. Replaced by
  `powderPolygons` (marching-squares regions with `mode`, `thresholdCm`,
  `expectedSnowCm`, `score`, `reason`, `dominantFactor`, `coordinates`).
- `latest.json` `summary` gained `maxGustKph`, `forecastWindDirectionDeg`,
  `forecastAvgWindKph`, `forecastMaxGustKph`, `forecastTemperatureMinC`,
  `forecastTemperatureMaxC` (all optional; UI falls back to recent values).
- `public/data/terrain.json`: now 240x280 grid (~31 m cells) from
  OpenTopoData nzdem8m, tighter bbox (171.500-171.592, -43.535 - -43.455).
  Heights carry one decimal. `scripts/fetch-opentopo-terrain.ts` caches
  batches in `.terrain-cache/` (gitignored) and resumes on failure.
- Trail data corrections (names/difficulties vs the official 2026 PDF) are
  applied at runtime by `src/lib/trailOverrides.ts`, not baked into
  `trails.geojson`, so an OSM refetch will not lose them.

## Current Risks
- Terrain is currently too generic.
- Powder overlay currently appears grid-like.
- Labels currently become too large/foggy.
- Trail/lift styling does not match the official Mt Hutt PDF.
- Deployment currently works from `gh-pages`; avoid breaking it.
