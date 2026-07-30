import clearDay from '@meteocons/svg/flat/clear-day.svg'
import fog from '@meteocons/svg/flat/fog.svg'
import overcast from '@meteocons/svg/flat/overcast.svg'
import partlyCloudyDay from '@meteocons/svg/flat/partly-cloudy-day.svg'
import drizzle from '@meteocons/svg/flat/partly-cloudy-day-drizzle.svg'
import snow from '@meteocons/svg/flat/snow.svg'
import rain from '@meteocons/svg/flat/rain.svg'
import thunderstorms from '@meteocons/svg/flat/thunderstorms.svg'

const ICONS = {
  clear: clearDay,
  drizzle,
  fog,
  overcast,
  partly: partlyCloudyDay,
  rain,
  snow,
  storm: thunderstorms,
} as const

type Props = {
  condition: string
  size?: number
  className?: string
}

function iconForCondition(condition: string) {
  const value = condition.toLowerCase()
  if (value.includes('storm') || value.includes('thunder')) return ICONS.storm
  if (value.includes('snow') || value.includes('flurr')) return ICONS.snow
  if (value.includes('rain') || value.includes('sleet')) return ICONS.rain
  if (value.includes('drizzle')) return ICONS.drizzle
  if (value.includes('fog') || value.includes('haze')) return ICONS.fog
  if (value.includes('partly')) return ICONS.partly
  if (value.includes('clear')) return ICONS.clear
  return ICONS.overcast
}

export function Meteocon({ condition, size = 48, className }: Props) {
  return (
    <img
      src={iconForCondition(condition)}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
