import { useQuery } from '@tanstack/react-query'
import { Dialog, Toast } from 'antd-mobile'
import { Bookmark, ChevronRight, Eye, LogIn, LogOut, MessageSquareText, Moon, Settings2, ShieldCheck, Sparkles, Star, Sun, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/States'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'
import type { ThemeMode } from '../types'

const themes: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Settings2 }
]

const reviewStatusLabels = {
  published: '已发布',
  pending: '机器审核中',
  pending_manual: '等待人工审核',
  rejected: '未通过审核',
  hidden: '已下架'
} as const

export function MinePage() {
  const navigate = useNavigate()
  const { user, favorites, themeMode, setThemeMode, logout, toggleFavorite } = useAppState()
  const favoriteQuery = useQuery({ queryKey: ['favorite-merchants', favorites], queryFn: () => api.getFavoriteMerchants(favorites) })
  const reviewQuery = useQuery({ queryKey: ['my-reviews', user?.id], queryFn: () => api.getMyReviews(user!.id), enabled: Boolean(user) })
  const statsQuery = useQuery({
    queryKey: ['my-stats', user?.id],
    queryFn: () => api.getMyStats(),
    enabled: Boolean(user),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false
  })

  const signOut = async () => {
    const confirmed = await Dialog.confirm({ content: '退出后会清除账号派生的收藏与个人缓存，并切换为新的游客会话。确定退出吗？', confirmText: '退出登录' })
    if (confirmed) { await logout(); Toast.show('已安全退出') }
  }

  return (
    <div className="page mine-page">
      <header className="mine-title"><div><span>我的</span><h1>{user ? '欢迎回来，校园美食家' : '你的专属口味档案'}</h1></div><button type="button" aria-label="设置"><Settings2 size={21} /></button></header>

      {user ? (
        <section className="profile-card">
          <div className="profile-card__glow" />
          <div className="profile-card__main"><span className="profile-avatar">{user.displayName.slice(0, 1)}<i /></span><div><h2>{user.displayName}</h2><p>@{user.username} · 校园吃货 Lv.4</p><span><ShieldCheck size={13} /> {user.emailVerified === false ? '邮箱待验证' : '邮箱已验证'}</span></div><button type="button" onClick={() => user.emailVerified === false ? navigate('/verify-email') : undefined}><ChevronRight size={20} /></button></div>
          <div className="profile-stats">
            <div><strong data-testid="published-review-count">{statsQuery.data?.publishedReviews ?? '—'}</strong><span>发表推荐</span></div>
            <div><strong data-testid="total-review-views">{statsQuery.data ? statsQuery.data.totalViews.toLocaleString() : '—'}</strong><span>累计阅读 <Eye size={12} /></span></div>
            <div><strong>{favorites.length}</strong><span>收藏商家</span></div>
          </div>
        </section>
      ) : (
        <section className="guest-card">
          <div className="guest-card__art"><span>🍽️</span><i>✨</i></div>
          <div><span className="eyebrow">CAMPUS FOODIE</span><h2>登录，让每次推荐<br />更懂你的胃</h2><p>同步收藏与评价，解锁专属口味画像</p></div>
          <button className="primary-action" type="button" onClick={() => navigate('/login')}><LogIn size={18} /> 登录 / 注册</button>
          <small>无需登录也可浏览和收藏</small>
        </section>
      )}

      <section className="mine-section">
        <div className="mine-section__heading"><div><span className="section-icon amber"><Star size={18} fill="currentColor" /></span><h2>我的收藏</h2><b>{favorites.length}</b></div><Link to="/map">地图查看 <ChevronRight size={15} /></Link></div>
        {favoriteQuery.data && favoriteQuery.data.length > 0 ? (
          <div className="favorite-scroll">
            {favoriteQuery.data.map((merchant) => (
              <article key={merchant.id} className="favorite-place-card">
                <div><span>{merchant.category.includes('饮') ? '☕' : merchant.category.includes('轻食') ? '🥗' : '🍜'}</span><button type="button" aria-label="取消收藏" onClick={() => toggleFavorite(merchant.id)}><Star size={16} fill="currentColor" /></button></div>
                <strong>{merchant.name}</strong><small><b>{merchant.isDemo ? `参考评分 ${merchant.rating}` : `★ ${merchant.rating}`}</b> · {merchant.distance}m</small>
              </article>
            ))}
          </div>
        ) : <EmptyState title="还没有收藏" description="看到喜欢的商家，点亮星星就会出现在这里。" />}
      </section>

      <section className="mine-section">
        <div className="mine-section__heading"><div><span className="section-icon blue"><MessageSquareText size={18} /></span><h2>我的评价</h2>{user && <b>{reviewQuery.data?.length ?? 0}</b>}</div>{user && <button type="button" onClick={() => navigate('/review/new')}>去评价 <ChevronRight size={15} /></button>}</div>
        {!user ? (
          <button className="login-inline-card" type="button" onClick={() => navigate('/login')}>
            <span><UserRound size={22} /></span><div><strong>登录后查看评价记录</strong><small>你分享的真实体验，会帮助更多同学</small></div><ChevronRight size={19} />
          </button>
        ) : reviewQuery.data && reviewQuery.data.length ? (
          <div className="my-review-list">{reviewQuery.data.slice(0, 3).map((review) => <div key={review.id}><span>{review.dish?.name ?? '校园美食'}</span><strong>{'★'.repeat(review.rating)}</strong><small>{reviewStatusLabels[review.status]} · {review.createdAt}</small></div>)}</div>
        ) : <EmptyState title="还没有发表评价" description="吃到好味道后，别忘了回来分享体验。" />}
      </section>

      <section className="settings-card">
        <div className="settings-card__title"><span><Moon size={18} /></span><div><strong>外观模式</strong><small>夜晚也能舒适浏览</small></div></div>
        <div className="theme-segment">{themes.map(({ value, label, icon: Icon }) => <button type="button" className={themeMode === value ? 'is-active' : ''} key={value} onClick={() => setThemeMode(value)}><Icon size={16} />{label}</button>)}</div>
      </section>

      <div className="mine-links">
        <button type="button" onClick={() => navigate('/preferences')}><span><Sparkles size={19} />口味偏好</span><ChevronRight size={18} /></button>
        <button type="button"><span><Bookmark size={19} />关于校园食刻</span><ChevronRight size={18} /></button>
      </div>

      {user && <button className="logout-button" type="button" onClick={signOut}><LogOut size={18} />退出登录</button>}
      <p className="version-text">Campus Foodie v0.1 · 把每一餐选得刚刚好</p>
    </div>
  )
}
