import { Clock3, MapPin, Sparkles, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { DishCardData } from '../types'

export function DishCard({ item, onFavorite }: { item: DishCardData; onFavorite: (merchantId: string) => void }) {
  const navigate = useNavigate()
  return (
    <article className="dish-card" onClick={() => navigate(`/dish/${item.id}`)}>
      <div className="dish-card__media">
        <img src={item.image} alt={item.name} loading="lazy" />
        <span className="match-badge"><Sparkles size={12} /> {item.match}% 匹配</span>
        <button
          className={`favorite-button ${item.favorite ? 'is-favorite' : ''}`}
          type="button"
          aria-label={item.favorite ? '取消收藏商家' : '收藏商家'}
          onClick={(event) => { event.stopPropagation(); onFavorite(item.merchantId) }}
        >
          <Star size={20} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="dish-card__content">
        <div className="dish-card__heading">
          <div>
            <span className="eyebrow">{item.category}</span>
            <h3>{item.name}</h3>
          </div>
          <span className="dish-price"><small>¥</small>{item.price}</span>
        </div>
        <p className="merchant-line">{item.merchant.name}</p>
        <div className="dish-meta">
          <span className="rating-value"><Star size={14} fill="currentColor" /> {item.rating}</span>
          <span>{item.reviewCount} 条评价</span>
          <span><Clock3 size={13} /> {item.waitMinutes} 分钟</span>
          <span><MapPin size={13} /> {item.merchant.distance}m</span>
        </div>
        <div className="reason"><Sparkles size={15} /><span>{item.reason}</span></div>
      </div>
    </article>
  )
}
