import { CalendarClock, CloudSnow, Cloudy, Map, Mountain, RotateCcw, Route, Snowflake, Thermometer, Wind } from 'lucide-react'
import { useViewStore } from '../state/viewStore'

export function Toolbar() {
  const {
    powderMode,
    showTrails,
    showClouds,
    showSnowfall,
    showWind,
    showFreezingLevel,
    exaggeration,
    mapView,
    setPowderMode,
    toggleTrails,
    toggleClouds,
    toggleSnowfall,
    toggleWind,
    toggleFreezingLevel,
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
        <CalendarClock size={19} />
      </button>
      <button
        className={`tool-button ${showClouds ? 'active' : ''}`}
        type="button"
        onClick={toggleClouds}
        title="Live cloud layer"
        aria-label="Toggle live cloud layer"
      >
        <Cloudy size={19} />
      </button>
      <button
        className={`tool-button ${showSnowfall ? 'active' : ''}`}
        type="button"
        onClick={toggleSnowfall}
        title="Falling snow"
        aria-label="Toggle falling snow"
      >
        <Snowflake size={19} />
      </button>
      <button
        className={`tool-button ${showWind ? 'active' : ''}`}
        type="button"
        onClick={toggleWind}
        title="Wind streaks"
        aria-label="Toggle wind streaks"
      >
        <Wind size={19} />
      </button>
      <button
        className={`tool-button ${showFreezingLevel ? 'active' : ''}`}
        type="button"
        onClick={toggleFreezingLevel}
        title="Live freezing level band"
        aria-label="Toggle live freezing level band"
      >
        <Thermometer size={19} />
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
