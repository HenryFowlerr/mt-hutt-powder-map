import { formatDistanceToNow } from 'date-fns'
import { HuttMark } from './AlpineIcons'
import type { DataProvenance } from '../lib/dataCache'

type Props = {
  generatedAt?: string
  provenance?: DataProvenance | null
}

export function BrandHeader({ generatedAt, provenance }: Props) {
  const isCached = provenance?.source === 'cache'
  const cachedLabel = isCached
    ? `Cached data · saved ${formatDistanceToNow(new Date(provenance.cachedAt), {
        addSuffix: true,
      })}`
    : null

  return (
    <div className="product-identity">
      <span className="brand-mark">
        <HuttMark size={32} />
      </span>
      <span className="brand-copy">
        <strong>Hutt Powder</strong>
        <span>Mt Hutt · Canterbury</span>
      </span>
      <span
        className={`brand-freshness${isCached ? ' cached' : ''}`}
        role={isCached ? 'status' : undefined}
        aria-live={isCached ? 'polite' : undefined}
        title={
          isCached
            ? `${cachedLabel}. Showing the last verified mountain data while fresh data is unavailable.`
            : undefined
        }
      >
        <i />
        {cachedLabel ??
          (generatedAt
            ? `Updated ${formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}`
            : 'Loading mountain')}
      </span>
    </div>
  )
}
