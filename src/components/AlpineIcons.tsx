import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function iconProps({ size = 24, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    ...props,
  }
}

export function HuttMark(props: IconProps) {
  return (
    <svg {...iconProps(props)} viewBox="0 0 32 32">
      <path d="M4.5 22.8 13.2 8.9l4.1 6.1 2.2-3.3 8 11.1" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.1 22.8h17.8M10 26h12" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
      <path d="m11.8 11.2 2.2 1.4 2-1.1" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SnowPocketIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 16.8c3.1-2.9 5.9-2.8 8.5-.8 2.6 2 5.5 2.1 8.5-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 3.5v8M8.5 5.5l7 4M15.5 5.5l-7 4" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M5 20.2h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".45" />
    </svg>
  )
}

export function ContourIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 7.1c2.6-2.3 5.4-2.3 8.1-.2 2.9 2.3 5.9 2.2 8.9-.4M3.5 12.1c2.6-2.3 5.4-2.3 8.1-.2 2.9 2.3 5.9 2.2 8.9-.4M3.5 17.1c2.6-2.3 5.4-2.3 8.1-.2 2.9 2.3 5.9 2.2 8.9-.4" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  )
}

export function WindArcIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 8.2h10.7c2.7 0 2.7-4 0-4-1.2 0-2 .6-2.4 1.5M3.5 12h15.2c2.8 0 2.8 4.1 0 4.1-1.2 0-2-.6-2.4-1.5M3.5 15.8h7.1" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </svg>
  )
}

export function IceFacetIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m12 3.2 7.3 4.3v9L12 20.8l-7.3-4.3v-9L12 3.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m4.9 7.6 7.1 4.2 7.1-4.2M12 11.8v8.6M8.3 5.3 12 11.8l3.7-6.5" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" opacity=".72" />
    </svg>
  )
}

export function ConditionGlyph({ condition, ...props }: IconProps & { condition: string }) {
  const value = condition.toLowerCase()
  if (value.includes('snow')) {
    return (
      <svg {...iconProps(props)}>
        <path d="M7.1 14.3a4.3 4.3 0 1 1 1.6-8.2 5.3 5.3 0 0 1 9.9 2.6 3.1 3.1 0 0 1-1 6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
        <path d="m7 17 2 3m2-3 2 3m2-3 2 3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    )
  }
  if (value.includes('rain') || value.includes('drizzle')) {
    return (
      <svg {...iconProps(props)}>
        <path d="M7.1 14.3a4.3 4.3 0 1 1 1.6-8.2 5.3 5.3 0 0 1 9.9 2.6 3.1 3.1 0 0 1-1 6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
        <path d="m8.5 17-1 3m5-3-1 3m5-3-1 3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    )
  }
  if (value.includes('clear')) {
    return (
      <svg {...iconProps(props)}>
        <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.55" />
        <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg {...iconProps(props)}>
      <path d="M6.7 17.2a4.7 4.7 0 1 1 1.8-9 5.7 5.7 0 0 1 10.6 2.9 3.4 3.4 0 0 1-3.2 6.1H6.7Z" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.2 8.2A4.7 4.7 0 0 1 9 3.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity=".55" />
    </svg>
  )
}
