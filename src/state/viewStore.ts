import { create } from 'zustand'

type PowderMode = 'recent' | 'forecast' | 'off'
export type InspectorView = 'brief' | 'forecast' | 'layers'

type ViewState = {
  powderMode: PowderMode
  inspectorView: InspectorView
  showIce: boolean
  showTrails: boolean
  showClouds: boolean
  showSnowfall: boolean
  showWind: boolean
  showFreezingLevel: boolean
  exaggeration: number
  mapView: boolean
  resetCount: number
  orientationResetCount: number
  cameraBearing: number
  focusPoint: { lon: number; lat: number } | null
  focusCount: number
  setPowderMode: (mode: PowderMode) => void
  setInspectorView: (view: InspectorView) => void
  toggleIce: () => void
  toggleTrails: () => void
  toggleClouds: () => void
  toggleSnowfall: () => void
  toggleWind: () => void
  toggleFreezingLevel: () => void
  toggleExaggeration: () => void
  toggleMapView: () => void
  resetCamera: () => void
  resetOrientation: () => void
  setCameraBearing: (bearing: number) => void
  focusOn: (lon: number, lat: number) => void
  clearFocus: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  powderMode: 'forecast',
  inspectorView: 'brief',
  showIce: false,
  showTrails: true,
  showClouds: false,
  showSnowfall: false,
  showWind: false,
  showFreezingLevel: false,
  exaggeration: 1.25,
  mapView: false,
  resetCount: 0,
  orientationResetCount: 0,
  cameraBearing: 0,
  focusPoint: null,
  focusCount: 0,
  setPowderMode: (mode) =>
    set((state) => ({ powderMode: state.powderMode === mode ? 'off' : mode })),
  setInspectorView: (inspectorView) => set({ inspectorView }),
  toggleIce: () => set((state) => ({ showIce: !state.showIce })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  toggleClouds: () => set((state) => ({ showClouds: !state.showClouds })),
  toggleSnowfall: () => set((state) => ({ showSnowfall: !state.showSnowfall })),
  toggleWind: () => set((state) => ({ showWind: !state.showWind })),
  toggleFreezingLevel: () => set((state) => ({ showFreezingLevel: !state.showFreezingLevel })),
  toggleExaggeration: () =>
    set((state) => ({ exaggeration: state.exaggeration > 1.4 ? 1.25 : 1.75 })),
  toggleMapView: () =>
    set((state) => ({ mapView: !state.mapView, resetCount: state.resetCount + 1 })),
  resetCamera: () => set((state) => ({ resetCount: state.resetCount + 1, focusPoint: null })),
  resetOrientation: () =>
    set((state) => ({ orientationResetCount: state.orientationResetCount + 1 })),
  setCameraBearing: (bearing) =>
    set((state) => {
      const normalizedBearing = ((Math.round(bearing) % 360) + 360) % 360
      return normalizedBearing === state.cameraBearing
        ? state
        : { cameraBearing: normalizedBearing }
    }),
  // Clicking the same zone again clears the focus and returns to overview.
  focusOn: (lon, lat) =>
    set((state) => {
      if (state.focusPoint && state.focusPoint.lon === lon && state.focusPoint.lat === lat) {
        return { focusPoint: null, resetCount: state.resetCount + 1 }
      }
      return { focusPoint: { lon, lat }, focusCount: state.focusCount + 1 }
    }),
  clearFocus: () => set((state) => ({ focusPoint: null, resetCount: state.resetCount + 1 })),
}))
