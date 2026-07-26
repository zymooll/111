import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Toast } from 'antd-mobile'
import { ArrowLeft, Clock3, Flame, Heart, MapPin, MessageCircleMore, Navigation, Share2, Sparkles, Star, Store, ThumbsUp } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, FeedSkeleton, LoadingState } from '../components/States'
import { Stars } from '../components/Stars'
import { api } from '../services/api'
import { newEventId } from '../services/interactions'
import { useAppState } from '../store/AppState'

export function DishDetailPage() {
  const { dishId = '' } = useParams()
  const navigate = useNavigate()
  const { isFavorite, toggleFavorite } = useAppState()
  const [photoIndex, setPhotoIndex] = useState(0)
  const viewedDish = useRef<string | null>(null)
  const viewedReviews = useRef(new Set<string>())
  const dishQuery = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => api.getDish(dishId),
    refetchOnWindowFocus: true
  })
  const reviewsQuery = useQuery({
    queryKey: ['dish-reviews', dishId],
    queryFn: () => api.getDishReviews(dishId),
    refetchOnWindowFocus: true
  })
  const dish = dishQuery.data
  const isDemo = Boolean(dish?.isDemo || dish?.merchant.isDemo)
  const favorite = dish ? isFavorite(dish.merchantId) : false

  useEffect(() => {
    if (!dish || viewedDish.current === dish.id) return
    viewedDish.current = dish.id
    void api.recordInteractions([{
      eventId: newEventId('view'),
      eventType: 'view',
      dishId: dish.id,
      merchantId: dish.merchantId,
      metadata: { source: 'dish_detail' }
    }]).catch(() => undefined)
  }, [dish])

  useEffect(() => {
    const fresh = (reviewsQuery.data ?? []).filter((review) => !viewedReviews.current.has(review.id))
    fresh.forEach((review) => {
      viewedReviews.current.add(review.id)
      void api.viewReview(review.id, newEventId('review-view')).catch(() => undefined)
    })
  }, [reviewsQuery.data])

  if (dishQuery.isLoading) return <div className="page subpage"><FeedSkeleton /></div>
  if (dishQuery.isError) return <div className="page subpage"><ErrorState retry={() => dishQuery.refetch()} /></div>
  if (!dish) return <div className="page subpage"><EmptyState title="这道菜暂时下架了" description="返回首页看看其他同学喜欢的味道。" /></div>

  const toggle = () => {
    toggleFavorite(dish.merchantId)
    Toast.show({ icon: 'success', content: favorite ? '已取消收藏商家' : '已收藏商家' })
  }

  return (
    <div className="page dish-detail-page">
      <section className="dish-hero">
        <img src={dish.gallery[photoIndex] ?? dish.image} alt={dish.name} />
        <div className="dish-hero__shade" />
        <button type="button" className="floating-icon left" onClick={() => navigate(-1)} aria-label="返回"><ArrowLeft size={21} /></button>
        <div className="dish-hero__actions"><button type="button" className="floating-icon" onClick={() => Toast.show('分享链接已准备好')} aria-label="分享"><Share2 size={19} /></button><button type="button" className={`floating-icon ${favorite ? 'is-favorite' : ''}`} onClick={toggle} aria-label="收藏商家"><Star size={20} fill={favorite ? 'currentColor' : 'none'} /></button></div>
        <div className="photo-dots">{dish.gallery.map((_, index) => <button key={index} className={index === photoIndex ? 'is-active' : ''} type="button" onClick={() => setPhotoIndex(index)} aria-label={`查看第 ${index + 1} 张图片`} />)}</div>
      </section>

      <section className="dish-detail-main">
        <div className="dish-title-row"><div><span className="eyebrow">{dish.category} · {dish.tags[0]}{isDemo ? ' · 演示菜品' : ''}</span><h1>{dish.name}</h1></div><div className="detail-price"><small>{isDemo ? '参考 ¥' : '¥'}</small><strong>{dish.price}</strong>{dish.originalPrice && <del>¥{dish.originalPrice}</del>}</div></div>
        <p className="dish-subtitle">{dish.subtitle}</p>
        <div className="detail-rating-row"><span><Star size={17} fill="currentColor" /><strong>{isDemo ? `参考评分 ${dish.rating}` : dish.rating}</strong><small>{dish.reviewCount} 条{isDemo ? '评价（含演示）' : '评价'}</small></span>{dish.match !== undefined && <div><span className="rank-bar"><i style={{ width: `${dish.match}%` }} /></span><strong>{dish.match}% {isDemo ? '参考推荐' : '推荐'}</strong></div>}</div>
        {dish.reason && <div className="reason detail-reason"><Sparkles size={18} /><div><strong>为什么推荐给你</strong><span>{dish.reason}</span></div></div>}

        {(dish.calories !== undefined || dish.waitMinutes !== undefined || dish.ingredients.length > 0) && (
          <div className="nutrition-grid">
            {dish.calories !== undefined && <div><Flame size={19} /><strong>{dish.calories}</strong><span>约千卡</span></div>}
            {dish.waitMinutes !== undefined && <div><Clock3 size={19} /><strong>{dish.waitMinutes}</strong><span>{isDemo ? '参考分钟' : '预计分钟'}</span></div>}
            {dish.ingredients.length > 0 && <div><Heart size={19} /><strong>{dish.ingredients.length}</strong><span>主要食材</span></div>}
          </div>
        )}
        <div className="ingredient-row">{dish.ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div>
      </section>

      <section className="merchant-detail-card">
        <span className="merchant-detail-card__icon"><Store size={23} /></span>
        <div>
          <strong>{dish.merchant.name}</strong>
          {(dish.merchant.rating !== undefined || dish.merchant.reviewCount !== undefined) && (
            <span>
              {dish.merchant.rating !== undefined && <b>{isDemo ? `参考评分 ${dish.merchant.rating}` : `★ ${dish.merchant.rating}`}</b>}
              {dish.merchant.reviewCount !== undefined && `${dish.merchant.rating !== undefined ? ' · ' : ''}${dish.merchant.reviewCount} 条${isDemo ? '评价（含演示）' : '商家相关评价'}`}
            </span>
          )}
          {(dish.merchant.area || dish.merchant.openUntil) && (
            <small>
              <MapPin size={13} /> {dish.merchant.area}
              {dish.merchant.openUntil && `${dish.merchant.area ? ' · ' : ''}${isDemo ? '参考时段' : '营业至'} ${dish.merchant.openUntil}`}
            </small>
          )}
        </div>
        <button type="button" onClick={() => navigate('/map')}><Navigation size={18} /><span>导航</span></button>
      </section>

      <section className="reviews-section">
        <header><div><h2>{isDemo ? '评价内容' : '同学们怎么说'}</h2><span>共 {dish.reviewCount} 条{isDemo ? '评价（含演示）' : '评价'}</span></div><button type="button" onClick={() => navigate(`/dish/${dish.id}/review`)}>写评价</button></header>
        {reviewsQuery.isLoading && <LoadingState label="正在读取评价…" />}
        {reviewsQuery.isError && <ErrorState retry={() => reviewsQuery.refetch()} />}
        {reviewsQuery.data?.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-card__user"><span>{review.avatarText}</span><div><strong>{review.userName}</strong><small><Stars value={review.rating} size={12} /> · {review.createdAt}</small></div><button type="button" onClick={() => Toast.show('感谢你的认同')}><ThumbsUp size={15} />{review.likes}</button></div>
            <p>{review.content}</p>
            {review.images.length > 0 && <div className="review-images">{review.images.map((image, index) => <img key={`${image}-${index}`} src={image} alt="评价配图" />)}</div>}
          </article>
        ))}
        {reviewsQuery.data?.length === 0 && <EmptyState title="还没有评价" description="吃过的同学，来做第一个分享的人吧。" />}
      </section>

      <div className="detail-action-bar">
        <button type="button" className="detail-action-secondary" onClick={() => Toast.show('已打开评价区')}><MessageCircleMore size={20} /><span>评价</span></button>
        <button type="button" className={`detail-action-secondary ${favorite ? 'is-favorite' : ''}`} onClick={toggle}><Star size={20} fill={favorite ? 'currentColor' : 'none'} /><span>收藏</span></button>
        <button type="button" className="primary-action" onClick={() => navigate(`/dish/${dish.id}/review`)}>我也吃过</button>
      </div>
    </div>
  )
}
