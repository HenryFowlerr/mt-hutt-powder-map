import { create } from 'zustand'

type PowderMode = 'recent' | 'forecast' | 'off'

type ViewState = {
  powderMode: PowderMode
  showTrails: boolean
  showStorm: boolean
  exaggeration: number
  mapView: boolean
  resetCount: number
  setPowderMode: (mode: PowderMode) => void
  toggleTrails: () => void
  toggleStorm: () => void
  toggleExaggeration: () => void
  toggleMapView: () => void
  resetCamera: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  powderMode: 'recent',
  showTrails: true,
  showStorm: false,
  exaggeration: 1.25,
  mapView: false,
  resetCount: 0,
  setPowderMode: (mode) =>
    set((state) => ({ powderMode: state.powderMode === mode ? 'off' : mode })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  toggleStorm: () => set((state) => ({ showStorm: !state.showStorm })),
  toggleExaggeration: () =>
    set((state) => ({ exaggeration: state.exaggeration > 1.4 ? 1.25 : 1.75 })),
  toggleMapView: () =>
    set((state) => ({ mapView: !state.mapView, resetCount: state.resetCount + 1 })),
  resetCamera: () => set((state) => ({ resetCount: state.resetCount + 1 })),
}))
