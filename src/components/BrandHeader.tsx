import { formatDistanceToNow } from 'date-fns'
import { HuttMark } from './AlpineIcons'

type Props = {
  generatedAt?: string
}

export function BrandHeader({ generatedAt }: Props) {
  return (
    <header className="brand-header">
      <span className="brand-mark">
        <HuttMark size={32} />
      </span>
      <span className="brand-copy">
        <strong>Hutt Powder</strong>
        <span>Mt Hutt · Canterbury</span>
      </span>
      <span className="brand-freshness">
        <i />
        {generatedAt
          ? `Updated ${formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}`
          : 'Loading mountain'}
      </span>
    </header>
  )
}
