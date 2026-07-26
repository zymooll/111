import { useEffect, useRef } from 'react'
import { Clock3, MapPin, Sparkles, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DishCardData } from '../types'

interface DishCardProps {
  item: DishCardData
  favorite: boolean
  onFavorite: (merchantId: string) => void
  onOpen?: (item: DishCardData) => void
  onImpression?: (item: DishCardData) => void
}

export function DishCard({ item, favorite, onFavorite, onOpen, onImpression }: DishCardProps) {
  const cardRef = useRef<HTMLElement>(null)
  const isDemo = Boolean(item.isDemo || item.merchant.isDemo)

  useEffect(() => {
    const target = cardRef.current
    if (!target || !onImpression || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      onImpression(item)
    }, { threshold: 0.5 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [item, onImpression])

  return (
    <article className="dish-card" ref={cardRef}>
      <div className="dish-card__media">
        <img src={item.image} alt={item.name} loading="lazy" />
        {item.match !== undefined && <span className="match-badge"><Sparkles size={12} /> {item.match}% 匹配</span>}
        <button
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          type="button"
          aria-label={favorite ? '取消收藏商家' : '收藏商家'}
          onClick={() => onFavorite(item.merchantId)}
        >
          <Star size={20} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="dish-card__content">
        <div className="dish-card__heading">
          <div>
            <span className="eyebrow">{item.category}{isDemo ? ' · 演示菜品' : ''}</span>
            <h3><Link className="dish-card__link" to={`/dish/${item.id}`} onClick={() => onOpen?.(item)}>{item.name}</Link></h3>
          </div>
          <span className="dish-price"><small>{isDemo ? '参考 ¥' : '¥'}</small>{item.price}</span>
        </div>
        {item.merchant.name && <p className="merchant-line">{item.merchant.name}</p>}
        <div className="dish-meta">
          <span className="rating-value"><Star size={14} fill="currentColor" /> {isDemo ? `参考评分 ${item.rating}` : item.rating}</span>
          <span>{item.reviewCount} 条{isDemo ? '评价（含演示）' : '评价'}</span>
          {item.waitMinutes !== undefined && <span><Clock3 size={13} /> {isDemo ? '参考 ' : ''}{item.waitMinutes} 分钟</span>}
          {item.merchant.distance !== undefined && <span><MapPin size={13} /> {item.merchant.distance}m</span>}
        </div>
        {item.reason && <div className="reason"><Sparkles size={15} /><span>{item.reason}</span></div>}
      </div>
    </article>
  )
}
