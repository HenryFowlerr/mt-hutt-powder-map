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

## Current Risks
- Terrain is currently too generic.
- Powder overlay currently appears grid-like.
- Labels currently become too large/foggy.
- Trail/lift styling does not match the official Mt Hutt PDF.
- Deployment currently works from `gh-pages`; avoid breaking it.
