import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { powderColorForCm, type PowderField, type PowderWeather } from '../lib/powderModel'
import { terrainPoint } from '../lib/terrain'
import type { TerrainAnalysis } from '../lib/terrainAnalysis'
import { buildZoneSummaries } from '../lib/zoneSummary'
import { useViewStore } from '../state/viewStore'
import type { TerrainData, TrailCollection } from '../types'

type Props = {
  terrain: TerrainData
  trails: TrailCollection
  analysis: TerrainAnalysis
  field: PowderField
  weather: PowderWeather
}

export function ZoneMarkers({ terrain, trails, analysis, field, weather }: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  const exaggeration = useViewStore((state) => state.exaggeration)
  const focusPoint = useViewStore((state) => state.focusPoint)
  const focusOn = useViewStore((state) => state.focusOn)
  const mapInteracting = useViewStore((state) => state.mapInteracting)
  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'

  const zones = useMemo(() => {
    if (powderMode === 'off') return []
    const ranked = buildZoneSummaries(terrain, analysis, field, weather, trails, mode)
    if ((ranked[0]?.maxCm ?? 0) < 0.15) return []
    return ranked.slice(0, 3).map((zone, index) => {
      const position = terrainPoint(zone.anchorLon, zone.anchorLat, terrain, exaggeration)
      position.y += 0.1
      return { ...zone, position, rank: index + 1 }
    })
  }, [powderMode, terrain, analysis, field, weather, trails, mode, exaggeration])

  return (
    <group>
      {zones.map((zone) => {
        const selected =
          focusPoint?.lon === zone.anchorLon && focusPoint?.lat === zone.anchorLat
        const signalColor = powderColorForCm(zone.maxCm)
        return (
          <Html
            key={zone.name}
            position={zone.position}
            center
            occlude={!mapInteracting}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: mapInteracting ? 'none' : 'auto' }}
          >
            <button
              type="button"
              // The same focus action is available in the ordered zone list
              // below the map. Keep these overlaid shortcuts out of the
              // sequential keyboard order so navigation moves from the global
              // toolbar directly into the inspector.
              tabIndex={-1}
              aria-label={`Focus ${zone.name}, ranked ${zone.rank}, ${zone.maxCm} centimetres`}
              aria-pressed={selected}
              title={`${zone.rank}. ${zone.name} · ${zone.maxCm} cm`}
              onClick={(event) => {
                event.stopPropagation()
                focusOn(zone.anchorLon, zone.anchorLat)
              }}
              style={{
                display: 'grid',
                width: 44,
                height: 44,
                padding: 0,
                placeItems: 'center',
                border: 0,
                borderRadius: '50%',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  width: 30,
                  height: 30,
                  placeItems: 'center',
                  border: `2px solid ${selected ? '#0b6678' : 'rgba(255,255,255,.96)'}`,
                  borderRadius: '50%',
                  color: selected || zone.maxCm >= 10 ? '#ffffff' : '#102832',
                  background: selected ? '#0b6678' : signalColor,
                  boxShadow: '0 1px 4px rgba(10,35,46,.24)',
                  font: '700 10px/1 system-ui, sans-serif',
                }}
              >
                {String(zone.rank).padStart(2, '0')}
              </span>
            </button>
          </Html>
        )
      })}
    </group>
  )
}
