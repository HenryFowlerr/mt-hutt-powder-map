import { create } from 'zustand'

type ViewState = {
  showRecent: boolean
  showForecast: boolean
  showTrails: boolean
  exaggeration: number
  resetCount: number
  toggleRecent: () => void
  toggleForecast: () => void
  toggleTrails: () => void
  toggleExaggeration: () => void
  resetCamera: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  showRecent: true,
  showForecast: false,
  showTrails: true,
  exaggeration: 1.45,
  resetCount: 0,
  toggleRecent: () => set((state) => ({ showRecent: !state.showRecent })),
  toggleForecast: () => set((state) => ({ showForecast: !state.showForecast })),
  toggleTrails: () => set((state) => ({ showTrails: !state.showTrails })),
  toggleExaggeration: () =>
    set((state) => ({ exaggeration: state.exaggeration > 1.5 ? 1.15 : 1.65 })),
  resetCamera: () => set((state) => ({ resetCount: state.resetCount + 1 })),
}))
