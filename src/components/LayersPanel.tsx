import type { ReactNode } from 'react'
import { Cloud, CloudSnow, Mountain, Route, Thermometer } from 'lucide-react'
import { useViewStore } from '../state/viewStore'
import { IceFacetIcon, WindArcIcon } from './AlpineIcons'

type LayerButtonProps = {
  active: boolean
  label: string
  detail: string
  icon: ReactNode
  onClick: () => void
}

function LayerButton({ active, label, detail, icon, onClick }: LayerButtonProps) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-pressed={active}>
      <span>{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <i />
    </button>
  )
}

export function LayersPanel() {
  const {
    showIce,
    showTrails,
    showClouds,
    showSnowfall,
    showWind,
    showFreezingLevel,
    exaggeration,
    toggleIce,
    toggleTrails,
    toggleClouds,
    toggleSnowfall,
    toggleWind,
    toggleFreezingLevel,
    toggleExaggeration,
  } = useViewStore()

  return (
    <section className="layers-view" aria-label="Map layers">
      <header className="inspector-view-header">
        <p>Map composition</p>
        <h1>What the map shows</h1>
        <span>Keep the base map quiet. Add technical evidence only when you need it.</span>
      </header>

      <div className="layer-list">
        <LayerButton
          active={showTrails}
          label="Trails & lifts"
          detail="Official difficulty colours"
          icon={<Route size={19} />}
          onClick={toggleTrails}
        />
        <LayerButton
          active={showIce}
          label="Surface risk"
          detail="Hardpack and refreeze signal"
          icon={<IceFacetIcon size={20} />}
          onClick={toggleIce}
        />
        <LayerButton
          active={showWind}
          label="Wind"
          detail="Direction across the terrain"
          icon={<WindArcIcon size={20} />}
          onClick={toggleWind}
        />
        <LayerButton
          active={showFreezingLevel}
          label="Freezing level"
          detail="Current atmospheric band"
          icon={<Thermometer size={19} />}
          onClick={toggleFreezingLevel}
        />
        <LayerButton
          active={showClouds}
          label="Cloud deck"
          detail="Reported low and mid cloud"
          icon={<Cloud size={19} />}
          onClick={toggleClouds}
        />
        <LayerButton
          active={showSnowfall}
          label="Snowfall"
          detail="Animated storm intensity"
          icon={<CloudSnow size={19} />}
          onClick={toggleSnowfall}
        />
      </div>

      <button
        type="button"
        className={`terrain-toggle ${exaggeration > 1.4 ? 'active' : ''}`}
        onClick={toggleExaggeration}
      >
        <Mountain size={18} />
        <span>
          <strong>Terrain relief</strong>
          <small>{exaggeration > 1.4 ? 'Enhanced vertical detail' : 'Natural scale'}</small>
        </span>
      </button>
    </section>
  )
}
