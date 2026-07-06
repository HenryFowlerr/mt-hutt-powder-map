import { create } from 'zustand'

type PowderMode = 'recent' | 'forecast' | 'off'

type ViewState = {
  powderMode: PowderMode
  showTrails: boolean
  showClouds: boolean
  showSnowfall: boolean
  showWind: boolean
  exaggeration: number
  mapView: boolean
  resetCount: number
  setPowderMode: (mode: PowderMode) => void
  toggleTrails: () => void
  toggleClouds: () => void
  toggleSnowfall: () => void
  toggleWind: () => void
  toggleExaggeration: () => void
  toggleMapView: () => void
  resetCamera: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  powderMode: 'recent',
  showTrails: true,
  showClouds: false,
  showSnowfall: false,
  showWind: false,
  exaggeration: 1.25,
  mapView: false,
  resetCount: 0,
  setPowderMode: (mode) =>
    set((state) => ({ powderMode: state.powderMode === mode ? 'off' : mode })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  toggleClouds: () => set((state) => ({ showClouds: !state.showClouds })),
  toggleSnowfall: () => set((state) => ({ showSnowfall: !state.showSnowfall })),
  toggleWind: () => set((state) => ({ showWind: !state.showWind })),
  toggleExaggeration: () =>
    set((state) => ({ exaggeration: state.exaggeration > 1.4 ? 1.25 : 1.75 })),
  toggleMapView: () =>
    set((state) => ({ mapView: !state.mapView, resetCount: state.resetCount + 1 })),
  resetCamera: () => set((state) => ({ resetCount: state.resetCount + 1 })),
}))
