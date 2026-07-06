import { CloudSnow, Layers, Mountain, RotateCcw, Route, Wind } from 'lucide-react'
import { useViewStore } from '../state/viewStore'

export function Toolbar() {
  const {
    showRecent,
    showForecast,
    showTrails,
    exaggeration,
    toggleRecent,
    toggleForecast,
    toggleTrails,
    toggleExaggeration,
    resetCamera,
  } = useViewStore()

  return (
    <nav className="toolbar" aria-label="Map controls">
      <button
        className={`tool-button ${showRecent ? 'active' : ''}`}
        type="button"
        onClick={toggleRecent}
        title="Recent powder estimate"
        aria-label="Toggle recent powder estimate"
      >
        <CloudSnow size={19} />
      </button>
      <button
        className={`tool-button ${showForecast ? 'active' : ''}`}
        type="button"
        onClick={toggleForecast}
        title="Forecast loading estimate"
        aria-label="Toggle forecast loading estimate"
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
        className={`tool-button ${exaggeration > 1.5 ? 'active' : ''}`}
        type="button"
        onClick={toggleExaggeration}
        title="Terrain exaggeration"
        aria-label="Toggle terrain exaggeration"
      >
        <Mountain size={19} />
      </button>
      <button className="tool-button" type="button" onClick={resetCamera} title="Reset camera" aria-label="Reset camera">
        <RotateCcw size={19} />
      </button>
      <span aria-hidden="true" className="tool-button">
        <Layers size={19} />
      </span>
    </nav>
  )
}
