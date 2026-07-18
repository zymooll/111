import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Popup, Switch, Toast } from 'antd-mobile'
import { ChevronDown, Layers3, LocateFixed, MapPin, Navigation, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { categoryTree } from '../data/mockData'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'
import type { MapFilters, Merchant } from '../types'

type MerchantWithFavorite = Merchant & { favorite: boolean }
type MapGroup = { id: string; items: MerchantWithFavorite[]; x: number; y: number; favorite: boolean }

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

const categoryOptions = categoryTree.flatMap((group) => group.children ?? [])
const tastes = ['麻辣', '酸辣', '清爽', '高蛋白', '夜宵', '早餐']

export function MapPage() {
  const { favorites, toggleFavorite } = useAppState()
  const [filters, setFilters] = useState<MapFilters>({})
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<MapGroup | null>(null)

  const query = useQuery({
    queryKey: ['map-merchants', filters, favorites],
    queryFn: () => api.getMerchants(filters, favorites)
  })
  const groups = useMemo(() => makeGroups(query.data ?? []), [query.data])
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

      <section className="campus-map" aria-label="校园商家地图">
        <div className="map-grid" />
        <div className="map-water water-one" />
        <div className="map-water water-two" />
        <div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" />
        <span className="map-label label-library">图书馆</span>
        <span className="map-label label-sports">体育馆</span>
        <span className="map-label label-dorm">学生宿舍</span>
        <span className="map-label label-south">南苑食堂</span>
        {groups.map((group) => group.items.length > 1 ? (
          <button key={group.id} type="button" className={`map-marker cluster ${group.favorite ? 'has-star' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)}>
            {group.favorite && <Star className="marker-star" size={14} fill="currentColor" />}
            <span>{group.items.length}</span>
          </button>
        ) : (
          <button key={group.id} type="button" className={`map-marker pin ${group.favorite ? 'is-favorite' : ''}`} style={{ left: `${group.x}%`, top: `${group.y}%` }} onClick={() => setSelectedGroup(group)} aria-label={group.items[0].name}>
            {group.favorite ? <Star size={17} fill="currentColor" /> : <MapPin size={18} fill="currentColor" />}
          </button>
        ))}

        {query.data?.length === 0 && <div className="map-empty"><span>🗺️</span><strong>没有符合条件的商家</strong><small>试试放宽筛选条件</small></div>}
        <div className="map-side-tools">
          <button type="button" aria-label="地图图层"><Layers3 size={20} /></button>
          <button type="button" aria-label="定位到当前位置" onClick={() => Toast.show('已定位到南校区')}><LocateFixed size={20} /></button>
        </div>
        <div className="my-location" style={{ left: '54%', top: '72%' }}><span /></div>
        <div className="map-attribution">Campus Foodie · 示意地图</div>
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
          <div className="sheet-group"><strong>餐饮类别</strong><div className="option-grid">{categoryOptions.map((option) => <button type="button" className={filters.categoryId === option.id ? 'is-active' : ''} key={option.id} onClick={() => update('categoryId', filters.categoryId === option.id ? undefined : option.id)}>{option.icon} {option.label}</button>)}</div></div>
          <div className="sheet-group"><strong>口味与场景</strong><div className="option-grid">{tastes.map((taste) => <button type="button" className={filters.taste === taste ? 'is-active' : ''} key={taste} onClick={() => update('taste', filters.taste === taste ? undefined : taste)}>{taste}</button>)}</div></div>
          <label className="favorite-switch"><span><Star size={19} fill="currentColor" /><span><strong>只看我的收藏</strong><small>地图标记会以星星突出显示</small></span></span><Switch checked={Boolean(filters.favoriteOnly)} onChange={(value) => update('favoriteOnly', value)} /></label>
          <button type="button" className="primary-action" onClick={() => setSheetOpen(false)}>查看 {query.data?.length ?? 0} 家商家</button>
        </section>
      </Popup>
    </div>
  )
}
