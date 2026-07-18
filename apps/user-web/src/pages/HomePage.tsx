import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, Toast } from 'antd-mobile'
import { ArrowRight, ChevronDown, History, LocateFixed, Search, SlidersHorizontal, Sparkles, TrendingUp } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DishCard } from '../components/DishCard'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/States'
import { api } from '../services/api'
import { newEventId } from '../services/interactions'
import { useAppState } from '../store/AppState'

function findTreeLabel(tree: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }>, id?: string) {
  if (!id) return undefined
  for (const parent of tree) {
    if (parent.id === id) return parent.label
    const child = parent.children?.find((item) => item.id === id)
    if (child) return child.label
  }
  return undefined
}

export function HomePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, favorites, toggleFavorite } = useAppState()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const impressedItems = useRef(new Set<string>())
  const loadMoreRef = useRef<HTMLButtonElement | null>(null)
  const categoryId = params.get('category') ?? undefined
  const areaId = params.get('area') ?? undefined

  useEffect(() => setSearch(params.get('q') ?? ''), [params])

  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: () => api.getCatalog() })
  const query = useInfiniteQuery({
    queryKey: ['recommendations', params.toString(), favorites],
    queryFn: ({ pageParam }) => api.getRecommendations(
      { query: params.get('q') ?? undefined, categoryId, areaId },
      favorites,
      pageParam || undefined
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  })

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const quickCategories = useMemo(() => catalogQuery.data?.categories.flatMap((group) => group.children?.length ? group.children : [group]).slice(0, 5) ?? [], [catalogQuery.data])
  const categoryLabel = findTreeLabel(catalogQuery.data?.categories ?? [], categoryId) ?? '全部品类'
  const areaLabel = findTreeLabel(catalogQuery.data?.areas ?? [], areaId) ?? catalogQuery.data?.campusName ?? '全部地点'
  const insight = useMemo(() => items[0]?.reason ?? '正在分析你最近的口味偏好', [items])

  useEffect(() => {
    const freshItems = items.filter((item) => !impressedItems.current.has(item.id))
    if (!freshItems.length) return
    freshItems.forEach((item) => impressedItems.current.add(item.id))
    void api.recordInteractions(freshItems.map((item) => ({
      eventId: newEventId('impression'),
      eventType: 'impression' as const,
      dishId: item.id,
      merchantId: item.merchantId,
      metadata: { source: 'home_feed' }
    }))).catch(() => undefined)
  }, [items])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !query.hasNextPage || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage) void query.fetchNextPage()
    }, { rootMargin: '180px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const next = new URLSearchParams(params)
    if (search.trim()) next.set('q', search.trim())
    else next.delete('q')
    setParams(next)
    if (search.trim()) {
      void api.recordInteractions([{
        eventId: newEventId('search'),
        eventType: 'search',
        metadata: { query: search.trim(), source: 'home_search' }
      }]).catch(() => undefined)
    }
  }

  const setCategory = (id?: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set('category', id)
    else next.delete('category')
    setParams(next)
  }

  const favorite = (merchantId: string) => {
    const wasFavorite = favorites.includes(merchantId)
    toggleFavorite(merchantId)
    Toast.show({ icon: 'success', content: wasFavorite ? '已取消收藏' : '已收藏商家' })
  }

  return (
    <div className="page home-page">
      <div className="apple-global-nav">
        <span className="apple-global-nav__mark">⌘</span>
        <span>Campus Foodie</span>
        <Link to="/mine" aria-label="进入个人中心">我的</Link>
      </div>
      <header className="home-header">
        <Link to="/mine" className="avatar-button" aria-label="进入个人中心">
          <span>{user?.displayName.slice(0, 1) ?? '食'}</span>
          <i />
        </Link>
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={19} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="你想吃什么？" aria-label="搜索菜品" />
          {search && <button type="button" onClick={() => { setSearch(''); const next = new URLSearchParams(params); next.delete('q'); setParams(next) }}>清除</button>}
        </form>
      </header>

      <section className="welcome-row">
        <div>
          <p>{user ? `${user.displayName}，今天想吃点什么？` : '校园饮食推荐'}</p>
          <h1>把每一餐，都选得刚刚好</h1>
          <p className="apple-hero-copy">从真实菜品开始，为你留出更从容的选择。</p>
          <div className="apple-hero-actions"><button type="button" onClick={() => navigate('/filter/category')}>开始探索 <ArrowRight size={15} /></button><button type="button" onClick={() => navigate('/map')}>查看地图</button></div>
        </div>
        <span className="weather-pill">今日 · 28°</span>
      </section>

      <section className="filter-row" aria-label="推荐筛选">
        <button type="button" className="filter-select" onClick={() => navigate(`/filter/category?return=${encodeURIComponent(`/${params.toString() ? `?${params}` : ''}`)}`)}>
          <span className="filter-select__icon">🍜</span><span><small>品类</small>{categoryLabel}</span><ChevronDown size={15} />
        </button>
        <button type="button" className="filter-select" onClick={() => navigate(`/filter/area?return=${encodeURIComponent(`/${params.toString() ? `?${params}` : ''}`)}`)}>
          <span className="filter-select__icon blue"><LocateFixed size={18} /></span><span><small>地点</small>{areaLabel}</span><ChevronDown size={15} />
        </button>
      </section>

      <div className="quick-scroll" aria-label="快捷品类">
        <button className={!categoryId ? 'quick-chip is-active' : 'quick-chip'} type="button" onClick={() => setCategory()}>✨ 为你推荐</button>
        {quickCategories.map((item) => (
          <button key={item.id} className={categoryId === item.id ? 'quick-chip is-active' : 'quick-chip'} type="button" onClick={() => setCategory(item.id)}>{item.icon} {item.label}</button>
        ))}
      </div>

      <section className="ai-insight">
        <span className="ai-insight__icon"><Sparkles size={20} /></span>
        <div><strong>食刻懂你</strong><p>{insight}</p></div>
        <span className="ai-insight__tag">AI 推荐</span>
      </section>

      <section className="apple-ai-tile">
        <p>Campus Foodie intelligence</p>
        <h2>今天吃什么，<br />有了更好的答案。</h2>
        <span>AI 只帮助排序，真实菜品与评价始终来自校园。</span>
        <button type="button" onClick={() => navigate('/filter/category')}>了解推荐方式 <ArrowRight size={15} /></button>
      </section>

      <section className="section-heading">
        <div><span><TrendingUp size={19} /></span><div><h2>{params.get('q') ? `“${params.get('q')}”的结果` : '今日灵感'}</h2><p>根据口味、距离与真实评价综合推荐</p></div></div>
        <button type="button" onClick={() => navigate('/filter/category')}><SlidersHorizontal size={17} /> 筛选</button>
      </section>

      {query.isLoading && <FeedSkeleton />}
      {query.isError && <ErrorState retry={() => query.refetch()} />}
      {query.data && items.length > 0 && (
        <div className="feed-list">
          {items.map((item) => <DishCard key={item.id} item={item} onFavorite={favorite} onOpen={(selected) => {
            void api.recordInteractions([{
              eventId: newEventId('click'),
              eventType: 'click',
              dishId: selected.id,
              merchantId: selected.merchantId,
              metadata: { source: 'home_feed' }
            }]).catch(() => undefined)
          }} />)}
          {query.hasNextPage ? (
            <button ref={loadMoreRef} className="feed-load-more" type="button" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
              {query.isFetchingNextPage ? '正在加载更多…' : '继续发现更多菜品'}
            </button>
          ) : <div className="feed-end"><span /><p>已经帮你看完附近的好味道</p><span /></div>}
        </div>
      )}
      {query.data && items.length === 0 && (
        <EmptyState
          title="还没找到合适的菜"
          description="换个关键词或清空筛选再看看吧。"
          action={<Button size="small" color="primary" onClick={() => { setSearch(''); setParams({}) }}>查看全部推荐</Button>}
        />
      )}

      {!user && (
        <aside className="guest-nudge">
          <History size={19} />
          <div><strong>登录后，推荐会越来越懂你</strong><span>游客收藏会在登录后自动保留</span></div>
          <Link to="/login">登录</Link>
        </aside>
      )}
    </div>
  )
}
