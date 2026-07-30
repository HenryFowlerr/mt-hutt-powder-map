import { Map, RotateCcw } from 'lucide-react'
import { useViewStore } from '../state/viewStore'
import { ContourIcon } from './AlpineIcons'

export function Toolbar() {
  const mapView = useViewStore((state) => state.mapView)
  const toggleMapView = useViewStore((state) => state.toggleMapView)
  const resetCamera = useViewStore((state) => state.resetCamera)

  return (
    <nav className="map-actions" aria-label="Map view controls">
      <button
        className={mapView ? 'active' : ''}
        type="button"
        onClick={toggleMapView}
        aria-label={mapView ? 'Switch to perspective view' : 'Switch to topographic view'}
      >
        {mapView ? <ContourIcon size={18} /> : <Map size={17} />}
        <span>{mapView ? 'Topographic' : 'Perspective'}</span>
      </button>
      <button type="button" onClick={resetCamera} aria-label="Reset map view">
        <RotateCcw size={17} />
        <span>Reset view</span>
      </button>
    </nav>
  )
}
