import { Star } from 'lucide-react'

export function Stars({ value, size = 14, showValue = false }: { value: number; size?: number; showValue?: boolean }) {
  return (
    <span className="stars" aria-label={`${value} 分`}>
      <span className="stars__row">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} size={size} fill={value >= star - 0.2 ? 'currentColor' : 'none'} strokeWidth={2} />
        ))}
      </span>
      {showValue && <strong>{value.toFixed(1)}</strong>}
    </span>
  )
}

export function RatingInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="rating-input" role="radiogroup" aria-label="评分">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" role="radio" aria-checked={value === star} onClick={() => onChange(star)}>
          <Star size={34} fill={value >= star ? 'currentColor' : 'none'} strokeWidth={1.7} />
        </button>
      ))}
    </div>
  )
}
