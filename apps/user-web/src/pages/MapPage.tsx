import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popup, Switch, Toast } from 'antd-mobile'
import { ChevronDown, Layers3, LocateFixed, MapPin, Navigation, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'
import type { MapFilters, Merchant } from '../types'

type MerchantWithFavorite = Merchant & { favorite: boolean }
type MapGroup = { id: string; items: MerchantWithFavorite[]; x: number; y: number; favorite: boolean }

const amapKey = import.meta.env.VITE_AMAP_KEY?.trim()
const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim()
let amapLoader: Promise<any> | null = null

function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (!amapKey) return Promise.reject(new Error('AMap key is not configured'))
  if (amapLoader) return amapLoader
  amapLoader = new Promise((resolve, reject) => {
    if (amapSecurityCode) window._AMapSecurityConfig = { securityJsCode: amapSecurityCode }
    const callback = '__campusFoodieAmapReady'
    const target = window as unknown as Record<string, unknown>
    target[callback] = () => {
      delete target[callback]
      if (window.AMap) resolve(window.AMap)
      else reject(new Error('AMap failed to initialize'))
    }
    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}&plugin=AMap.MarkerCluster&callback=${callback}`
    script.async = true
    script.onerror = () => {
      delete target[callback]
      amapLoader = null
      reject(new Error('AMap script failed to load'))
    }
    document.head.appendChild(script)
  })
  return amapLoader
}

function makeGroups(items: MerchantWithFavorite[]): MapGroup[] {
  const groups: MapGroup[] = []
  items.forEach((merchant) => {
    const existing = groups.find((group) => Math.hypot(group.x - merchant.position.x, group.y - merchant.position.y) < 9)
    if (existing) {
      existing.items.push(merchant)
      existing.x = existing.items.reduce((sum, item) => sum + item.position.x, 0) / existing.items.length
      existing.y = existing.items.reduce((sum, item) => sum + item.position.y, 0) / existing.items.length
      existing.favorite ||= merchant.favorite
      existing.id += `-${merchant.id}`
    } else {
      groups.push({ id: merchant.id, items: [merchant], x: merchant.position.x, y: merchant.position.y, favorite: merchant.favorite })
    }
  })
  return groups
}

export function MapPage() {
  const { favorites, toggleFavorite } = useAppState()
  const [filters, setFilters] = useState<MapFilters>({})
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<MapGroup | null>(null)
  const [amapFailed, setAmapFailed] = useState(false)
  const [amapLoading, setAmapLoading] = useState(Boolean(amapKey))
  const amapRoot = useRef<HTMLDivElement>(null)
  const amapInstance = useRef<any>(null)
  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: () => api.getCatalog() })
  const categoryOptions = useMemo(() => catalogQuery.data?.categories.flatMap((group) => group.children?.length ? group.children : [group]) ?? [], [catalogQuery.data])
  const tastes = useMemo(() => catalogQuery.data?.tags.filter((tag) => tag.kind === 'taste' || tag.kind === 'diet').map((tag) => tag.name) ?? [], [catalogQuery.data])

  const query = useQuery({
    queryKey: ['map-merchants', filters, favorites],
    queryFn: () => api.getMerchants(filters, favorites)
  })
  const groups = useMemo(() => makeGroups(query.data ?? []), [query.data])
  const useAmap = Boolean(amapKey) && !amapFailed
  const activeFilterCount = [filters.priceLevel, filters.categoryId, filters.taste, filters.favoriteOnly].filter(Boolean).length

  const update = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => setFilters((current) => ({ ...current, [key]: value }))
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    update('query', search.trim() || undefined)
  }
  const favorite = (merchantId: string) => {
    const wasFavorite = favorites.includes(merchantId)
    toggleFavorite(merchantId)
    setSelectedGroup((current) => current ? {
      ...current,
      favorite: current.items.some((item) => item.id === merchantId ? !wasFavorite : item.favorite),
      items: current.items.map((item) => item.id === merchantId ? { ...item, favorite: !wasFavorite } : item)
    } : null)
    Toast.show({ icon: 'success', content: wasFavorite ? '已取消收藏' : '已收藏商家' })
  }

  useEffect(() => {
    if (!useAmap || !amapRoot.current) return
    let disposed = false
    let cluster: any
    let map: any
    setAmapLoading(true)
    void loadAmap().then((AMap) => {
      if (disposed || !amapRoot.current) return
      const merchants = (query.data ?? []).filter((merchant) => merchant.longitude !== undefined && merchant.latitude !== undefined)
      const center = merchants.length
        ? [merchants.reduce((sum, merchant) => sum + Number(merchant.longitude), 0) / merchants.length, merchants.reduce((sum, merchant) => sum + Number(merchant.latitude), 0) / merchants.length]
        : [121.4782, 31.2285]
      map = new AMap.Map(amapRoot.current, {
        center,
        zoom: 17,
        mapStyle: 'amap://styles/fresh',
        viewMode: '2D',
        resizeEnable: true,
        doubleClickZoom: false
      })
      amapInstance.current = map
      const openMerchants = (items: MerchantWithFavorite[]) => setSelectedGroup({
        id: items.map((merchant) => merchant.id).join('-'),
        items,
        x: 50,
        y: 50,
        favorite: items.some((merchant) => merchant.favorite)
      })
      const bindSingleClick = (marker: any, content: HTMLButtonElement, items: MerchantWithFavorite[]) => {
        let lastOpenedAt = 0
        const openOnce = () => {
          const now = Date.now()
          if (now - lastOpenedAt < 250) return
          lastOpenedAt = now
          openMerchants(items)
        }
        content.addEventListener('pointerdown', (event) => event.stopPropagation())
        content.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          openOnce()
        })
        marker.off?.('click')
      }
      const points = merchants.map((merchant) => ({
        lnglat: [Number(merchant.longitude), Number(merchant.latitude)],
        merchant
      }))
      if (AMap.MarkerCluster && points.length > 1) {
        cluster = new AMap.MarkerCluster(map, points, {
          gridSize: 64,
          renderMarker: (context: any) => {
            const point = Array.isArray(context.data) ? context.data[0] : context.data
            const merchant = point?.merchant as MerchantWithFavorite | undefined
            if (!merchant) return
            const content = document.createElement('button')
            content.type = 'button'
            content.className = `amap-food-marker ${merchant.favorite ? 'is-favorite' : ''}`
            content.setAttribute('aria-label', merchant.name)
            content.textContent = merchant.favorite ? '★' : '●'
            context.marker.setContent(content)
            context.marker.setExtData?.(merchant)
            context.marker.setzIndex?.(80)
            bindSingleClick(context.marker, content, [merchant])
          },
          renderClusterMarker: (context: any) => {
            const clusterMerchants = (context.clusterData ?? [])
              .map((entry: any) => entry?.merchant)
              .filter(Boolean) as MerchantWithFavorite[]
            const containsFavorite = clusterMerchants.some((merchant) => merchant.favorite)
            const count = clusterMerchants.length || Number(context.count) || 0
            const content = document.createElement('button')
            content.type = 'button'
            content.className = `amap-cluster-marker ${containsFavorite ? 'has-star' : ''}`
            content.setAttribute('aria-label', `附近 ${count} 家商家${containsFavorite ? '，含收藏商家' : ''}`)
            if (containsFavorite) {
              const star = document.createElement('b')
              star.textContent = '★'
              content.appendChild(star)
            }
            const countLabel = document.createElement('span')
            countLabel.textContent = String(count)
            content.appendChild(countLabel)
            context.marker.setContent(content)
            context.marker.setzIndex?.(120)
            bindSingleClick(context.marker, content, clusterMerchants)
          }
        })
      } else {
        const markers = merchants.map((merchant) => {
          const content = document.createElement('button')
          content.type = 'button'
          content.className = `amap-food-marker ${merchant.favorite ? 'is-favorite' : ''}`
          content.setAttribute('aria-label', merchant.name)
          content.textContent = merchant.favorite ? '★' : '●'
          const marker = new AMap.Marker({
            position: [merchant.longitude, merchant.latitude],
            anchor: 'center',
            extData: merchant,
            content,
            zIndex: 80
          })
          bindSingleClick(marker, content, [merchant])
          return marker
        })
        map.add(markers)
        if (markers.length) map.setFitView(markers, false, [80, 36, 100, 36], 18)
      }
      setAmapLoading(false)
    }).catch(() => {
      if (!disposed) {
        setAmapFailed(true)
        setAmapLoading(false)
        Toast.show({ content: '高德地图加载失败，已切换校园示意地图' })
      }
    })
    return () => {
      disposed = true
      cluster?.setMap?.(null)
      map?.destroy?.()
      if (amapInstance.current === map) amapInstance.current = null
    }
  }, [query.data, useAmap])

  return (
    <div className="page map-page">
      <div className="map-toolbar">
        <form className="search-box map-search" onSubmit={submitSearch}>
          <Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商家或地点" />
          {search && <button type="button" onClick={() => { setSearch(''); update('query', undefined) }}><X size={15} /></button>}
        </form>
        <button className="round-tool" type="button" onClick={() => setSheetOpen(true)} aria-label="地图筛选">
          <SlidersHorizontal size={20} />{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        </button>
      </div>

      <div className="map-filter-scroll">
        <button type="button" className={filters.priceLevel ? 'is-active' : ''} onClick={() => setSheetOpen(true)}>价格 <ChevronDown size={14} /></button>
        <button type="button" className={filters.categoryId ? 'is-active' : ''} onClick={() => setSheetOpen(true)}>餐饮类别 <ChevronDown size={14} /></button>
        <button type="button" className={filters.taste ? 'is-active' : ''} onClick={() => setSheetOpen(true)}>口味 <ChevronDown size={14} /></button>
        <button type="button" className={filters.favoriteOnly ? 'is-active' : ''} onClick={() => update('favoriteOnly', !filters.favoriteOnly)}><Star size={14} fill={filters.favoriteOnly ? 'currentColor' : 'none'} /> 已收藏</button>
      </div>

      <section className={`campus-map ${useAmap ? 'amap-live' : ''}`} aria-label="校园商家地图">
        {useAmap ? <>
          <div className="amap-canvas" ref={amapRoot} />
          {amapLoading && <div className="amap-loading">正在加载高德地图…</div>}
        </> : <>
          <div className="map-grid" />
          <div className="map-water water-one" />
          <div className="map-water water-two" />
          <div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" />
          <span className="map-label label-library">图书馆</span>
          <span className="map-label label-sports">体育馆</span>
          <span className="map-label label-dorm">学生宿舍</span>
          <span className="map-label label-south">南苑食堂</span>
          {groups.map((group) => group.items.length > 1 ? (
            <button key={group.id} type="button" className={`map-marker cluster ${group.favorite ? 'has-star' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)} aria-label={`附近 ${group.items.length} 家商家${group.favorite ? '，含收藏商家' : ''}`} data-testid="merchant-cluster-marker">
              {group.favorite && <Star className="marker-star" size={14} fill="currentColor" />}
              <span>{group.items.length}</span>
            </button>
          ) : (
            <button key={group.id} type="button" className={`map-marker pin ${group.favorite ? 'is-favorite' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)} aria-label={group.items[0].name} data-testid="merchant-pin-marker">
              {group.favorite ? <Star size={17} fill="currentColor" /> : <MapPin size={18} fill="currentColor" />}
            </button>
          ))}
        </>}

        {query.data?.length === 0 && <div className="map-empty"><span>🗺️</span><strong>没有符合条件的商家</strong><small>试试放宽筛选条件</small></div>}
        <div className="map-side-tools">
          <button type="button" aria-label="地图图层"><Layers3 size={20} /></button>
          <button type="button" aria-label="定位到当前位置" onClick={() => { amapInstance.current?.setZoomAndCenter?.(17, [121.4782, 31.2285]); Toast.show('已定位到校园中心') }}><LocateFixed size={20} /></button>
        </div>
        {!useAmap && <><div className="my-location" style={{ left: '54%', top: '72%' }}><span /></div><div className="map-attribution">Campus Foodie · 示意地图</div></>}
      </section>

      <div className="map-summary"><span>{query.data?.length ?? 0} 家符合条件</span><small>点击地图标记查看详情</small></div>

      {selectedGroup && (
        <div className="merchant-drawer-backdrop" onClick={() => setSelectedGroup(null)}>
          <section className="merchant-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-handle" />
            <header><div><strong>{selectedGroup.items.length > 1 ? `附近 ${selectedGroup.items.length} 家商家` : '商家详情'}</strong><span>按距离由近到远</span></div><button type="button" onClick={() => setSelectedGroup(null)}><X size={20} /></button></header>
            <div className="merchant-drawer__list">
              {selectedGroup.items.map((merchant) => (
                <article className="merchant-mini-card" key={merchant.id}>
                  <div className="merchant-mini-card__icon">{merchant.category.includes('饮') ? '🧋' : merchant.category.includes('轻食') ? '🥗' : '🍜'}</div>
                  <div className="merchant-mini-card__content"><strong>{merchant.name}</strong><span><b>★ {merchant.rating}</b> · {merchant.category} · ¥{merchant.averagePrice}/人</span><small><Navigation size={13} /> {merchant.distance}m · 营业至 {merchant.openUntil}</small></div>
                  <button type="button" className={merchant.favorite ? 'mini-favorite is-favorite' : 'mini-favorite'} onClick={() => favorite(merchant.id)} aria-label="收藏商家"><Star size={20} fill={merchant.favorite ? 'currentColor' : 'none'} /></button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <Popup visible={sheetOpen} onMaskClick={() => setSheetOpen(false)} onClose={() => setSheetOpen(false)} bodyStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
        <section className="map-filter-sheet">
          <div className="drawer-handle" />
          <header><div><h2>筛选商家</h2><p>选出此刻最适合你的那一家</p></div><button type="button" onClick={() => setFilters({})}>重置</button></header>
          <div className="sheet-group"><strong>人均价格</strong><div className="option-grid price-options">{[
            { value: undefined, label: '不限' }, { value: 1, label: '¥ 20 以下' }, { value: 2, label: '¥¥ 20–40' }, { value: 3, label: '¥¥¥ 40 以上' }
          ].map((option) => <button type="button" className={filters.priceLevel === option.value ? 'is-active' : ''} key={option.label} onClick={() => update('priceLevel', option.value)}>{option.label}</button>)}</div></div>
          <div className="sheet-group"><strong>餐饮类别</strong><div className="option-grid">{categoryOptions.map((option) => <button type="button" className={filters.categoryId === option.id ? 'is-active' : ''} key={option.id} onClick={() => update('categoryId', filters.categoryId === option.id ? undefined : option.id)}>{option.icon} {option.label}</button>)}{catalogQuery.isLoading && <span className="catalog-inline-state">正在读取…</span>}{catalogQuery.isError && <button type="button" onClick={() => catalogQuery.refetch()}>目录加载失败，重试</button>}</div></div>
          <div className="sheet-group"><strong>口味与场景</strong><div className="option-grid">{tastes.map((taste) => <button type="button" className={filters.taste === taste ? 'is-active' : ''} key={taste} onClick={() => update('taste', filters.taste === taste ? undefined : taste)}>{taste}</button>)}</div></div>
          <label className="favorite-switch"><span><Star size={19} fill="currentColor" /><span><strong>只看我的收藏</strong><small>地图标记会以星星突出显示</small></span></span><Switch checked={Boolean(filters.favoriteOnly)} onChange={(value) => update('favoriteOnly', value)} /></label>
          <button type="button" className="primary-action" onClick={() => setSheetOpen(false)}>查看 {query.data?.length ?? 0} 家商家</button>
        </section>
      </Popup>
    </div>
  )
}
