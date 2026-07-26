import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popup, Switch, Toast } from 'antd-mobile'
import { ChevronDown, Layers3, LocateFixed, MapPin, Navigation, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { CAMPUS_CENTER_GCJ02 } from '../data/campus'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'
import type { MapFilters, Merchant } from '../types'

type PlacedMerchant = Merchant & { position: { x: number; y: number } }
type LocatedMerchant = Merchant & { longitude: number; latitude: number }
type MapGroup = { id: string; items: Merchant[]; x: number; y: number }

const amapKey = import.meta.env.VITE_AMAP_KEY?.trim()
let amapLoader: Promise<any> | null = null

// securityJsCode 按高德的设计只能由服务端代理持有，前端不注入；需要该密钥的能力（如逆地理编码）
// 必须先由后端提供代理接口，否则这里只加载不依赖它的基础地图能力。
function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (!amapKey) return Promise.reject(new Error('AMap key is not configured'))
  if (amapLoader) return amapLoader
  amapLoader = new Promise((resolve, reject) => {
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

function makeGroups(items: PlacedMerchant[]): MapGroup[] {
  const groups: MapGroup[] = []
  items.forEach((merchant) => {
    const existing = groups.find((group) => Math.hypot(group.x - merchant.position.x, group.y - merchant.position.y) < 9)
    if (existing) {
      existing.items.push(merchant)
      existing.x = existing.items.reduce((sum, item) => sum + (item.position?.x ?? 0), 0) / existing.items.length
      existing.y = existing.items.reduce((sum, item) => sum + (item.position?.y ?? 0), 0) / existing.items.length
      existing.id += `-${merchant.id}`
    } else {
      groups.push({ id: merchant.id, items: [merchant], x: merchant.position.x, y: merchant.position.y })
    }
  })
  return groups
}

function extractClusterMerchants(data: unknown): Merchant[] {
  const pending = Array.isArray(data) ? [...data] : [data]
  const merchants = new Map<string, Merchant>()

  while (pending.length) {
    const entry = pending.pop()
    if (Array.isArray(entry)) {
      pending.push(...entry)
      continue
    }
    if (!entry || typeof entry !== 'object') continue

    const point = entry as { merchant?: Merchant; data?: unknown }
    if (point.merchant) merchants.set(point.merchant.id, point.merchant)
    if (point.data) pending.push(point.data)
  }

  return [...merchants.values()]
}

export function recenterAmapToCampus(map?: { setZoomAndCenter?: (zoom: number, center: [number, number]) => void } | null) {
  map?.setZoomAndCenter?.(17, [CAMPUS_CENTER_GCJ02.longitude, CAMPUS_CENTER_GCJ02.latitude])
}

export function MapPage() {
  const { favorites, isFavorite, toggleFavorite } = useAppState()
  const [filters, setFilters] = useState<MapFilters>({})
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<MapGroup | null>(null)
  const [amapFailed, setAmapFailed] = useState(false)
  const [amapLoading, setAmapLoading] = useState(Boolean(amapKey))
  const amapRoot = useRef<HTMLDivElement>(null)
  const amapInstance = useRef<any>(null)
  const favoritesRef = useRef(favorites)
  const markerPainters = useRef(new Map<HTMLElement, () => void>())
  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: () => api.getCatalog() })
  const categoryOptions = useMemo(() => catalogQuery.data?.categories.flatMap((group) => group.children?.length ? group.children : [group]) ?? [], [catalogQuery.data])
  const tastes = useMemo(() => catalogQuery.data?.tags.filter((tag) => tag.kind === 'taste' || tag.kind === 'diet').map((tag) => tag.name) ?? [], [catalogQuery.data])

  const query = useQuery({
    queryKey: ['map-merchants', filters],
    queryFn: () => api.getMerchants(filters)
  })
  const merchants = useMemo(() => query.data ?? [], [query.data])
  const groups = useMemo(() => makeGroups(merchants.filter((merchant): merchant is PlacedMerchant => Boolean(merchant.position))), [merchants])
  const locatedMerchants = useMemo(
    () => merchants.filter((merchant): merchant is LocatedMerchant => merchant.longitude !== undefined && merchant.latitude !== undefined),
    [merchants]
  )
  const locatedSignature = useMemo(() => locatedMerchants.map((merchant) => merchant.id).join('|'), [locatedMerchants])
  const locatedRef = useRef(locatedMerchants)
  const useAmap = Boolean(amapKey) && !amapFailed
  const activeFilterCount = [filters.priceLevel, filters.categoryId, filters.taste, filters.favoriteOnly].filter(Boolean).length

  const update = <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => setFilters((current) => ({ ...current, [key]: value }))
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    update('query', search.trim() || undefined)
  }
  const favorite = (merchantId: string) => {
    const wasFavorite = isFavorite(merchantId)
    toggleFavorite(merchantId)
    Toast.show({ icon: 'success', content: wasFavorite ? '已取消收藏' : '已收藏商家' })
  }

  useEffect(() => { locatedRef.current = locatedMerchants }, [locatedMerchants])

  // 收藏是渲染层的叠加状态，只重绘已有标记，不重建地图。
  useEffect(() => {
    favoritesRef.current = favorites
    markerPainters.current.forEach((paint, node) => {
      if (node.isConnected) paint()
      else markerPainters.current.delete(node)
    })
  }, [favorites])

  useEffect(() => {
    if (!useAmap || !amapRoot.current) return
    let disposed = false
    let cluster: any
    let map: any
    setAmapLoading(true)
    void loadAmap().then((AMap) => {
      if (disposed || !amapRoot.current) return
      const located = locatedRef.current
      const center = located.length
        ? [located.reduce((sum, merchant) => sum + merchant.longitude, 0) / located.length, located.reduce((sum, merchant) => sum + merchant.latitude, 0) / located.length]
        : [CAMPUS_CENTER_GCJ02.longitude, CAMPUS_CENTER_GCJ02.latitude]
      map = new AMap.Map(amapRoot.current, {
        center,
        zoom: 17,
        mapStyle: 'amap://styles/fresh',
        viewMode: '2D',
        resizeEnable: true,
        doubleClickZoom: false
      })
      amapInstance.current = map
      const openMerchants = (items: Merchant[]) => setSelectedGroup({
        id: items.map((merchant) => merchant.id).join('-'),
        items,
        x: 50,
        y: 50
      })
      const bindSingleClick = (marker: any, content: HTMLButtonElement, items: Merchant[]) => {
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
      const singleMarkerContent = (merchant: Merchant) => {
        const content = document.createElement('button')
        content.type = 'button'
        content.setAttribute('aria-label', merchant.name)
        const paint = () => {
          const marked = favoritesRef.current.includes(merchant.id)
          content.className = `amap-food-marker ${marked ? 'is-favorite' : ''}`
          content.textContent = marked ? '★' : '●'
        }
        paint()
        markerPainters.current.set(content, paint)
        return content
      }
      const clusterMarkerContent = (items: Merchant[], count: number) => {
        const content = document.createElement('button')
        content.type = 'button'
        const star = document.createElement('b')
        star.textContent = '★'
        const countLabel = document.createElement('span')
        countLabel.textContent = String(count)
        const paint = () => {
          const marked = items.some((merchant) => favoritesRef.current.includes(merchant.id))
          content.className = `amap-cluster-marker ${marked ? 'has-star' : ''}`
          content.setAttribute('aria-label', `附近 ${count} 家商家${marked ? '，含收藏商家' : ''}`)
          content.replaceChildren(...(marked ? [star, countLabel] : [countLabel]))
        }
        paint()
        markerPainters.current.set(content, paint)
        return content
      }
      const points = located.map((merchant) => ({ lnglat: [merchant.longitude, merchant.latitude], merchant }))
      if (AMap.MarkerCluster && points.length > 1) {
        cluster = new AMap.MarkerCluster(map, points, {
          gridSize: 64,
          renderMarker: (context: any) => {
            const point = Array.isArray(context.data) ? context.data[0] : context.data
            const merchant = point?.merchant as Merchant | undefined
            if (!merchant) return
            const content = singleMarkerContent(merchant)
            context.marker.setContent(content)
            context.marker.setExtData?.(merchant)
            context.marker.setzIndex?.(80)
            bindSingleClick(context.marker, content, [merchant])
          },
          renderClusterMarker: (context: any) => {
            const clusterMerchants = extractClusterMerchants(context.clusterData)
            const count = Number(context.count) || clusterMerchants.length
            const content = clusterMarkerContent(clusterMerchants, count)
            context.marker.setContent(content)
            context.marker.setzIndex?.(120)
            bindSingleClick(context.marker, content, clusterMerchants)
          }
        })
      } else {
        const markers = located.map((merchant) => {
          const content = singleMarkerContent(merchant)
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
      markerPainters.current.clear()
      cluster?.setMap?.(null)
      map?.destroy?.()
      if (amapInstance.current === map) amapInstance.current = null
    }
  }, [locatedSignature, useAmap])

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
          {groups.map((group) => {
            const marked = group.items.some((merchant) => isFavorite(merchant.id))
            return group.items.length > 1 ? (
              <button key={group.id} type="button" className={`map-marker cluster ${marked ? 'has-star' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)} aria-label={`附近 ${group.items.length} 家商家${marked ? '，含收藏商家' : ''}`} data-testid="merchant-cluster-marker">
                {marked && <Star className="marker-star" size={14} fill="currentColor" />}
                <span>{group.items.length}</span>
              </button>
            ) : (
              <button key={group.id} type="button" className={`map-marker pin ${marked ? 'is-favorite' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)} aria-label={group.items[0].name} data-testid="merchant-pin-marker">
                {marked ? <Star size={17} fill="currentColor" /> : <MapPin size={18} fill="currentColor" />}
              </button>
            )
          })}
        </>}

        {query.isError && <div className="map-empty"><span>⚠️</span><strong>商家信息加载失败</strong><button type="button" className="text-button" onClick={() => query.refetch()}>重新加载</button></div>}
        {query.isSuccess && merchants.length === 0 && <div className="map-empty"><span>🗺️</span><strong>没有符合条件的商家</strong><small>试试放宽筛选条件</small></div>}
        <div className="map-side-tools">
          <button type="button" aria-label="地图图层"><Layers3 size={20} /></button>
          <button type="button" aria-label="定位到校园中心" onClick={() => { recenterAmapToCampus(amapInstance.current); Toast.show('已定位到校园中心') }}><LocateFixed size={20} /></button>
        </div>
        {!useAmap && <><div className="my-location" style={{ left: '54%', top: '72%' }}><span /></div><div className="map-attribution">Campus Foodie · 示意地图</div></>}
      </section>

      <div className="map-summary">
        {query.isError
          ? <><span>商家信息加载失败</span><small>请检查网络后重试</small></>
          : query.isLoading
            ? <><span>正在加载商家…</span><small>稍候片刻</small></>
            : <><span>{merchants.length} 家符合条件</span><small>点击地图标记查看详情</small></>}
      </div>

      {selectedGroup && (
        <div className="merchant-drawer-backdrop" onClick={() => setSelectedGroup(null)}>
          <section className="merchant-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-handle" />
            <header><div><strong>{selectedGroup.items.length > 1 ? `附近 ${selectedGroup.items.length} 家商家` : '商家详情'}</strong></div><button type="button" onClick={() => setSelectedGroup(null)}><X size={20} /></button></header>
            <div className="merchant-drawer__list">
              {selectedGroup.items.map((merchant) => (
                <article className="merchant-mini-card" key={merchant.id}>
                  <div className="merchant-mini-card__icon">{merchant.category.includes('饮') ? '🧋' : merchant.category.includes('轻食') ? '🥗' : '🍜'}</div>
                  <div className="merchant-mini-card__content">
                    <strong>{merchant.name}</strong>
                    <span>
                      {merchant.rating !== undefined && <b>{merchant.isDemo ? `参考评分 ${merchant.rating}` : `★ ${merchant.rating}`}</b>}
                      {merchant.rating !== undefined ? ` · ${merchant.category}` : merchant.category}
                      {merchant.averagePrice !== undefined && ` · ${merchant.isDemo ? '参考 ' : ''}¥${merchant.averagePrice}/人`}
                    </span>
                    {(merchant.distance !== undefined || merchant.openUntil) && (
                      <small>
                        <Navigation size={13} />
                        {merchant.distance !== undefined && ` ${merchant.distance}m`}
                        {merchant.openUntil && `${merchant.distance !== undefined ? ' · ' : ' '}${merchant.isDemo ? '参考时段' : '营业至'} ${merchant.openUntil}`}
                      </small>
                    )}
                  </div>
                  <button type="button" className={isFavorite(merchant.id) ? 'mini-favorite is-favorite' : 'mini-favorite'} onClick={() => favorite(merchant.id)} aria-label="收藏商家"><Star size={20} fill={isFavorite(merchant.id) ? 'currentColor' : 'none'} /></button>
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
          <button type="button" className="primary-action" onClick={() => setSheetOpen(false)}>{query.isSuccess ? `查看 ${merchants.length} 家商家` : '查看筛选结果'}</button>
        </section>
      </Popup>
    </div>
  )
}
