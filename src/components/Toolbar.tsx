import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarDays,
  Cloud,
  CloudSnow,
  Layers3,
  Map,
  Mountain,
  RotateCcw,
  Route,
  Thermometer,
  X,
} from 'lucide-react'
import { useViewStore } from '../state/viewStore'
import { ContourIcon, IceFacetIcon, WindArcIcon } from './AlpineIcons'

type LayerButtonProps = {
  active: boolean
  label: string
  detail: string
  icon: ReactNode
  onClick: () => void
}

function LayerButton({ active, label, detail, icon, onClick }: LayerButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'active' : ''}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <i />
    </button>
  )
}

export function Toolbar() {
  const [layersOpen, setLayersOpen] = useState(false)
  const {
    showIce,
    showTrails,
    showClouds,
    showSnowfall,
    showWind,
    showFreezingLevel,
    forecastOpen,
    exaggeration,
    mapView,
    toggleIce,
    toggleTrails,
    toggleClouds,
    toggleSnowfall,
    toggleWind,
    toggleFreezingLevel,
    toggleForecast,
    toggleExaggeration,
    toggleMapView,
    resetCamera,
  } = useViewStore()
  const enabledLayers = [showIce, showTrails, showClouds, showSnowfall, showWind, showFreezingLevel].filter(Boolean).length

  return (
    <>
      {layersOpen ? (
        <section className="layer-popover" aria-label="Map layers">
          <header>
            <div>
              <span>Map composition</span>
              <h2>Layers</h2>
            </div>
            <button type="button" className="popover-close" onClick={() => setLayersOpen(false)} aria-label="Close layers">
              <X size={17} />
            </button>
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
              detail="Live direction across terrain"
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
          <button type="button" className={`terrain-toggle ${exaggeration > 1.4 ? 'active' : ''}`} onClick={toggleExaggeration}>
            <Mountain size={18} />
            <span><strong>Terrain relief</strong><small>{exaggeration > 1.4 ? 'Enhanced' : 'Natural'}</small></span>
          </button>
        </section>
      ) : null}

      <nav className="toolbar" aria-label="Map controls">
        <button
          className={`tool-button layers-trigger ${layersOpen ? 'active' : ''}`}
          type="button"
          onClick={() => setLayersOpen((open) => !open)}
          aria-expanded={layersOpen}
          aria-label="Open map layers"
        >
          <Layers3 size={18} />
          <span>Layers</span>
          <i>{enabledLayers}</i>
        </button>
        <span className="tool-divider" />
        <button
          className={`tool-button ${mapView ? 'active' : ''}`}
          type="button"
          onClick={toggleMapView}
          aria-label={mapView ? 'Switch to perspective view' : 'Switch to topographic view'}
        >
          {mapView ? <ContourIcon size={19} /> : <Map size={18} />}
          <span>{mapView ? 'Topo' : '3D'}</span>
        </button>
        <button
          className={`tool-button ${forecastOpen ? 'active' : ''}`}
          type="button"
          onClick={toggleForecast}
          aria-label="Open 14-day forecast"
        >
          <CalendarDays size={18} />
          <span>Forecast</span>
        </button>
        <button className="tool-button" type="button" onClick={resetCamera} aria-label="Reset map view">
          <RotateCcw size={18} />
          <span>Reset</span>
        </button>
      </nav>
    </>
  )
}
