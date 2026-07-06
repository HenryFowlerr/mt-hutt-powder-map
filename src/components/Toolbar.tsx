import { CloudSnow, Map, Mountain, RotateCcw, Route, Wind } from 'lucide-react'
import { useViewStore } from '../state/viewStore'

export function Toolbar() {
  const {
    powderMode,
    showTrails,
    exaggeration,
    mapView,
    setPowderMode,
    toggleTrails,
    toggleExaggeration,
    toggleMapView,
    resetCamera,
  } = useViewStore()

  return (
    <nav className="toolbar" aria-label="Map controls">
      <button
        className={`tool-button ${powderMode === 'recent' ? 'active' : ''}`}
        type="button"
        onClick={() => setPowderMode('recent')}
        title="Recent powder estimate"
        aria-label="Toggle recent powder estimate"
      >
        <CloudSnow size={19} />
      </button>
      <button
        className={`tool-button ${powderMode === 'forecast' ? 'active' : ''}`}
        type="button"
        onClick={() => setPowderMode('forecast')}
        title="Forecast powder estimate"
        aria-label="Toggle forecast powder estimate"
      >
        <Wind size={19} />
      </button>
      <button
        className={`tool-button ${showTrails ? 'active' : ''}`}
        type="button"
        onClick={toggleTrails}
        title="Trails and lifts"
        aria-label="Toggle trails and lifts"
      >
        <Route size={19} />
      </button>
      <button
        className={`tool-button ${exaggeration > 1.4 ? 'active' : ''}`}
        type="button"
        onClick={toggleExaggeration}
        title="Terrain exaggeration"
        aria-label="Toggle terrain exaggeration"
      >
        <Mountain size={19} />
      </button>
      <button
        className={`tool-button ${mapView ? 'active' : ''}`}
        type="button"
        onClick={toggleMapView}
        title="Flat trail-map view"
        aria-label="Toggle flat trail-map view"
      >
        <Map size={19} />
      </button>
      <button className="tool-button" type="button" onClick={resetCamera} title="Reset camera" aria-label="Reset camera">
        <RotateCcw size={19} />
      </button>
    </nav>
  )
}
