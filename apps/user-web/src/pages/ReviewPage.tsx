import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Toast } from 'antd-mobile'
import { Camera, CheckCircle2, ChevronDown, ImagePlus, LogIn, Send, Sparkles, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { RatingInput } from '../components/Stars'
import { dishes } from '../data/mockData'
import { api, apiMode } from '../services/api'
import { useAppState } from '../store/AppState'

const ratingLabels = ['', '不太满意', '有待改进', '还不错', '值得推荐', '好吃到想安利']

export function ReviewPage() {
  const { dishId: routeDishId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, favorites } = useAppState()
  const [dishId, setDishId] = useState(routeDishId ?? '')
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [dishPicker, setDishPicker] = useState(!routeDishId)
  const dishQuery = useQuery({ queryKey: ['dish', dishId, favorites], queryFn: () => api.getDish(dishId, favorites), enabled: Boolean(dishId) })
  const dishOptionsQuery = useQuery({
    queryKey: ['review-dish-options', favorites],
    queryFn: () => api.getRecommendations({}, favorites)
  })
  const dishOptions = dishOptionsQuery.data?.items ?? (apiMode === 'mock' ? dishes : [])
  const selectedDish = dishQuery.data ?? dishOptions.find((dish) => dish.id === dishId)
  const draftKey = `campus-foodie:review-draft:${dishId || 'new'}`

  useEffect(() => {
    if (!dishId) return
    try {
      const saved = sessionStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved) as { rating: number; content: string; images: string[] }
        setRating(draft.rating); setContent(draft.content); setImages(draft.images)
      }
    } catch { /* ignore malformed local draft */ }
  }, [dishId, draftKey])

  useEffect(() => {
    if (dishId && (rating || content || images.length)) {
      try { sessionStorage.setItem(draftKey, JSON.stringify({ rating, content, images })) } catch { /* large image drafts may exceed browser quota */ }
    }
  }, [content, draftKey, dishId, images, rating])

  const mutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('请先登录')
      return api.submitReview(user, { dishId, rating, content: content.trim(), images })
    },
    onSuccess: async (review) => {
      sessionStorage.removeItem(draftKey)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dish-reviews', dishId] }),
        queryClient.invalidateQueries({ queryKey: ['my-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['my-stats'] })
      ])
      const message = review.status === 'published'
        ? '评价已发布，感谢你的分享'
        : review.status === 'pending_manual'
          ? '评价已提交，正在等待人工审核'
          : '评价已提交，审核通过后公开'
      Toast.show({ icon: <CheckCircle2 size={22} />, content: message })
      navigate(`/dish/${dishId}`, { replace: true })
    },
    onError: (error) => Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '提交失败，请稍后重试' })
  })

  const canSubmit = Boolean(dishId && rating && content.trim().length >= 5 && !mutation.isPending)
  const helper = useMemo(() => ratingLabels[rating] || '点亮星星，为这次体验打分', [rating])

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 9 - images.length)
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return Toast.show('仅支持图片文件')
      if (file.size > 10 * 1024 * 1024) return Toast.show('单张图片不能超过 10MB')
      const reader = new FileReader()
      reader.onload = () => setImages((current) => [...current, String(reader.result)].slice(0, 9))
      reader.readAsDataURL(file)
    })
    event.target.value = ''
  }

  const submit = () => {
    if (!canSubmit) return
    try { sessionStorage.setItem(draftKey, JSON.stringify({ rating, content, images })) } catch { /* The in-memory draft remains available. */ }
    const next = `/dish/${dishId}/review`
    if (!user) {
      Toast.show({ content: '草稿已保留，登录后可继续发布' })
      navigate('/login', { state: { next } })
      return
    }
    if (user.emailVerified === false) {
      Toast.show({ content: '草稿已保留，验证邮箱后可继续发布' })
      navigate('/verify-email', { state: { next } })
      return
    }
    mutation.mutate()
  }

  return (
    <div className="page subpage review-page">
      <PageHeader title="发表评价" subtitle="分享真实体验" action={<button className="header-text-button" type="button" disabled={!canSubmit} onClick={submit}><Send size={15} />发布</button>} />
      {!user && <aside className="review-draft-notice"><LogIn size={18} /><span><strong>游客也可以先写草稿</strong>发布时再登录，当前内容会在本次浏览会话中保留。</span></aside>}
      {user?.emailVerified === false && <aside className="review-draft-notice"><LogIn size={18} /><span><strong>可以先完成草稿</strong>发布前需要验证邮箱，验证后会回到这里。</span></aside>}
      <section className="review-dish-selector">
        <button type="button" onClick={() => setDishPicker((value) => !value)}>
          {selectedDish ? <><img src={selectedDish.image} alt="" /><span><small>正在评价</small><strong>{selectedDish.name}</strong></span></> : <><span className="selector-placeholder">🍜</span><span><small>先选择吃过的菜品</small><strong>选择菜品或套餐</strong></span></>}
          <ChevronDown size={19} />
        </button>
        {dishPicker && <div className="dish-picker-list">{dishOptions.map((dish) => <button type="button" key={dish.id} onClick={() => { setDishId(dish.id); setDishPicker(false); setRating(0); setContent(''); setImages([]) }}><img src={dish.image} alt="" /><span><strong>{dish.name}</strong><small>{dish.category} · ¥{dish.price}</small></span>{dishId === dish.id && <CheckCircle2 size={18} />}</button>)}</div>}
      </section>

      <section className="rating-panel"><span className="eyebrow">这次吃得怎么样？</span><RatingInput value={rating} onChange={setRating} /><strong className={rating ? 'has-value' : ''}>{helper}</strong></section>

      <section className="review-editor">
        <div className="review-editor__prompt"><Sparkles size={16} /><span>可以聊聊口味、分量、性价比和等餐时间</span></div>
        <textarea maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="真实、具体的体验最能帮助到同学……" />
        <span className="char-count">{content.length}/2000</span>
      </section>

      <section className="photo-uploader">
        <header><div><Camera size={18} /><strong>添加图片</strong><small>最多 9 张</small></div><span>{images.length}/9</span></header>
        <div className="photo-grid">
          {images.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`}><img src={image} alt={`待上传图片 ${index + 1}`} /><button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}
          {images.length < 9 && <label className="upload-button"><ImagePlus size={25} /><span>上传图片</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addImages} /></label>}
        </div>
      </section>

      <div className="review-guideline"><CheckCircle2 size={17} /><span>请分享真实用餐体验；提交后将经过内容审核。</span></div>
      <button type="button" className="primary-action submit-review" disabled={!canSubmit} onClick={submit}>{mutation.isPending ? '正在提交…' : user ? '发布评价' : '登录并发布'}</button>
    </div>
  )
}
