# Hutt Powder design system

## Product idea

Hutt Powder is an alpine decision instrument, not a generic weather dashboard. The map is the
content. Interface chrome should answer three questions quickly:

1. How much snow is there?
2. Where is it likely to collect?
3. When is the best window to ski?

## Visual character

- Quiet, exact, alpine, and editorial.
- Native system typography with compact metrics and generous headline scale.
- Snow and terrain use cool neutral tones; modelled powder owns a pale-to-deep alpine green scale
  so even light accumulation remains distinct from ice, cloud, trails, and interface controls.
- Dark midnight surfaces identify high-value decisions, such as the best ski window.
- Translucent material is reserved for navigation and floating controls. Content inside the snow
  brief uses dividers and whitespace instead of nested cards.
- The custom contour-mountain mark and condition glyphs are the core owned visual assets.
- Weather-state artwork uses the flat Meteocons pack at one primary decision point and in expanded
  forecast detail. Animated weather art must never repeat down an entire list.

## Core tokens

| Role | Value |
| --- | --- |
| Ink | `#09151c` |
| Muted text | `#667781` |
| Surface | `rgba(248, 251, 252, 0.92)` |
| Interface accent | `#087fd1` |
| Deep powder | `#075f3f` |
| Light powder | `#dff7e7` |
| Midnight decision | `#0b2533` |
| Live / good | `#159267` |

Corners are 8–14 px for controls and 19–22 px only for the two principal floating surfaces. Avoid
rounding every row or metric into an independent card.

## Interaction hierarchy

- The interface has three structural regions: a global command bar, the terrain map, and one
  edge-to-edge inspector. The map is never used as wallpaper behind floating content.
- Brief, Outlook, and Layers are mutually exclusive inspector views. A person always knows where
  information will appear, and opening one view never covers another.
- The snow brief defaults to the next 72 hours because it supports planning.
- Recent and forecast snow are a two-option segmented control, never independent toggles.
- Technical map layers live in the same inspector as the forecast and snow brief.
- The 14-day forecast is a secondary workspace view, not another surface over the terrain.
- Detailed model evidence is available under “Inside the model.”
- Zone rows move the camera to the actual terrain feature.
- The map adapts its visual threshold to each event, while legend labels and zone values always
  remain absolute centimetres. A dusting may be faint, but it is never silently discarded.
- Mobile follows the same hierarchy vertically: command bar, map, inspector navigation, content.
  It does not turn desktop panels into a stack of overlapping cards.

## Anti-slop guardrails

- No Inter, emoji weather icons, purple gradients, decorative glow, or repeated feature-card grids.
- No vague labels such as “Insights,” “Smart,” or “AI powered.”
- No unsupported quality claims.
- Do not give every number equal visual weight.
- Prefer one useful sentence over a badge, card, heading, and helper line saying the same thing.
- Add a new colour only when it represents new information on the map.
- A new surface must have a distinct hierarchy or interaction purpose; otherwise use whitespace and
  a divider.
- Avoid detached rounded containers for major page regions. Radius belongs to controls and small
  stateful elements, not to every section of the application.

## Accessibility and motion

- All icon-only controls require explicit accessible names.
- Active map layers and timeframes expose pressed state.
- Text remains legible without relying on translucent background colour alone.
- Motion is brief and spatial; reduced-motion preferences disable it.
- Mobile preserves a clear map viewport and gives the snow brief its own scroll area.
