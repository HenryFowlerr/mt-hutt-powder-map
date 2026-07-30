import { useEffect, useState } from 'react'

type RuntimeBudget = {
  dpr: number
  animate: boolean
  lowPower: boolean
}

function readRuntimeBudget(): RuntimeBudget {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { dpr: 1, animate: false, lowPower: true }
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const mobile = window.matchMedia('(max-width: 900px)').matches
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const lowPower =
    reducedMotion ||
    navigator.hardwareConcurrency <= 4 ||
    (typeof deviceMemory === 'number' && deviceMemory <= 4)
  const dprCap = lowPower ? 1.2 : mobile ? 1.4 : 1.8

  return {
    dpr: Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap)),
    animate: !document.hidden && !reducedMotion,
    lowPower,
  }
}

export function useWebglRuntimeBudget() {
  const [budget, setBudget] = useState(readRuntimeBudget)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia('(max-width: 900px)')
    const update = () => {
      const next = readRuntimeBudget()
      setBudget((current) =>
        current.dpr === next.dpr &&
        current.animate === next.animate &&
        current.lowPower === next.lowPower
          ? current
          : next,
      )
    }

    reducedMotion.addEventListener('change', update)
    mobile.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('resize', update)
    return () => {
      reducedMotion.removeEventListener('change', update)
      mobile.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return budget
}
