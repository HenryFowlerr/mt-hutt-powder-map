import { powderDisplayScale, type PowderField } from '../lib/powderModel'
import { useViewStore } from '../state/viewStore'

type Props = {
  field: PowderField
}

function formatDepth(value: number) {
  if (value < 1) return value.toFixed(1)
  return String(Math.round(value))
}

export function MapLegend({ field }: Props) {
  const powderMode = useViewStore((state) => state.powderMode)
  const mode = powderMode === 'forecast' ? 'forecast' : 'recent'
  const scale = powderDisplayScale(field, mode)

  return (
    <aside className="map-key" aria-label="Powder depth map legend">
      <div className="legend-title">
        <span>
          <i />
          Powder signal
        </span>
        <strong>{mode === 'forecast' ? 'Next 72 h' : 'Last 72 h'}</strong>
      </div>
      {scale.maxCm >= 0.15 ? (
        <>
          <div className="depth-scale" />
          <div className="depth-ticks">
            <span>{formatDepth(scale.minimumCm)} cm</span>
            <span>{formatDepth(Math.max(scale.minimumCm, scale.maxCm / 2))}</span>
            <span>{formatDepth(scale.maxCm)} cm</span>
          </div>
          <p>Relative terrain detail · labels remain absolute centimetres</p>
        </>
      ) : (
        <p className="empty-signal">No measurable powder event in this window.</p>
      )}
    </aside>
  )
}
