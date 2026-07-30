import { Map, Navigation2, RotateCcw } from 'lucide-react'
import { useViewStore } from '../state/viewStore'
import { ContourIcon } from './AlpineIcons'

export function Toolbar() {
  const mapView = useViewStore((state) => state.mapView)
  const cameraBearing = useViewStore((state) => state.cameraBearing)
  const toggleMapView = useViewStore((state) => state.toggleMapView)
  const resetCamera = useViewStore((state) => state.resetCamera)
  const resetOrientation = useViewStore((state) => state.resetOrientation)
  const northAligned = cameraBearing <= 1 || cameraBearing >= 359
  const orientationLabel = northAligned
    ? 'Reset map orientation to north. Currently north up.'
    : `Reset map orientation to north. Current bearing ${cameraBearing} degrees.`

  return (
    <nav className="map-actions" aria-label="Map view controls">
      <button
        className={mapView ? 'active' : ''}
        type="button"
        onClick={toggleMapView}
        aria-label={mapView ? 'Switch to perspective view' : 'Switch to topographic view'}
      >
        {mapView ? <ContourIcon size={18} /> : <Map size={17} />}
        <span className="action-label">{mapView ? 'Topographic' : 'Perspective'}</span>
      </button>
      <button type="button" onClick={resetCamera} aria-label="Reset map view">
        <RotateCcw size={17} />
        <span className="action-label">Reset view</span>
      </button>
      <button
        type="button"
        className={`compass-action ${northAligned ? 'north-aligned' : ''}`}
        onClick={resetOrientation}
        aria-label={orientationLabel}
        title={orientationLabel}
        data-bearing={cameraBearing}
        data-orientation={northAligned ? 'north-up' : 'rotated'}
      >
        <span className="compass-readout" aria-hidden="true">
          <Navigation2
            className="compass-needle"
            size={17}
            style={{ transform: `rotate(${-cameraBearing}deg)` }}
          />
          <span className="compass-letter">N</span>
        </span>
      </button>
    </nav>
  )
}
