import { CalendarDays, Layers3, MountainSnow } from 'lucide-react'
import { useViewStore, type InspectorView } from '../state/viewStore'

const VIEWS: Array<{
  id: InspectorView
  label: string
  icon: typeof MountainSnow
}> = [
  { id: 'brief', label: 'Brief', icon: MountainSnow },
  { id: 'forecast', label: 'Outlook', icon: CalendarDays },
  { id: 'layers', label: 'Layers', icon: Layers3 },
]

export function InspectorNav() {
  const inspectorView = useViewStore((state) => state.inspectorView)
  const setInspectorView = useViewStore((state) => state.setInspectorView)

  return (
    <nav className="inspector-nav" aria-label="Mountain information">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={inspectorView === id ? 'active' : ''}
          aria-current={inspectorView === id ? 'page' : undefined}
          onClick={() => setInspectorView(id)}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
