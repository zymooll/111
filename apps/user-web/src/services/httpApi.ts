import { CAMPUS_CENTER_GCJ02, CAMPUS_MAP_SPAN } from '../data/campus'
import type {
  AccountActionResult,
  AuthProvider,
  CatalogData,
  DishCardData,
  FeedFilters,
  FoodieApi,
  FoodPreferences,
  InteractionEventInput,
  MapFilters,
  Merchant,
  Review,
  ReviewDraft,
  TreeOption,
  User,
  UserStats
} from '../types'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:7993/api/v1').replace(/\/$/, '')
const accessTokenKey = 'campus-foodie:access-token'
const refreshTokenKey = 'campus-foodie:refresh-token'
const guestTokenKey = 'campus-foodie:guest-token'
const authExpiredEvent = 'campus-foodie:auth-expired'
export const degradedDataEvent = 'campus-foodie:degraded-data'
const apiOrigin = new URL(baseUrl, window.location.origin).origin
const configuredCampusId = import.meta.env.VITE_CAMPUS_ID

let guestTokenPromise: Promise<void> | null = null
let refreshPromise: Promise<boolean> | null = null
let catalogPromise: Promise<CatalogData> | null = null

export class HttpApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'HttpApiError'
  }
}

interface ApiUser {
  id: string
  username: string
  email: string
  role: string
  email_verified: boolean
}

interface TokenPair {
  access_token: string
  refresh_token: string
  user: ApiUser
}

interface ApiCampus {
  id: string
  name: string
  is_active: boolean
}

interface ApiTreeNode {
  id: string
  name: string
  level?: number | null
  icon?: string | null
  children?: ApiTreeNode[]
}

interface ApiTag {
  id: string
  name: string
  kind: string
}

interface ApiMerchant {
  id: string
  area_id: string | null
  category_id: string | null
  name: string
  description: string
  address: string
  gcj02_latitude: number
  gcj02_longitude: number
  price_level: number
  business_hours: string
  is_favorite: boolean
  rating_avg: number
}

interface ApiMenuItem {
  id: string
  merchant_id: string
  category_id: string | null
  name: string
  description: string
  item_type: string
  price_cents: number
  image_url: string
  rating_avg: number
  review_count: number
  tags: string[]
  merchant_name?: string | null
  merchant_address?: string | null
  recommendation_reason?: string | null
  is_merchant_favorite?: boolean
  merchant?: ApiMerchant
}

interface ApiReview {
  id: string
  user_id: string
  username?: string | null
  menu_item_id: string
  menu_item_name?: string | null
  rating: number
  text: string
  images: string[]
  status: string
  created_at: string
}

interface ApiStats {
  published_reviews: number
  total_views: number
  favorite_merchants: number
}

interface Page<T> { items: T[]; next_cursor?: string | null; total?: number }
interface MerchantFeature {
  geometry: { coordinates: [number, number] }
  properties: Record<string, unknown>
}

function params(values: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

function pageItems<T>(value: Page<T> | T[]): T[] {
  return Array.isArray(value) ? value : value.items
}

// 列表接口只提供 keyset 游标，需要完整集合时按 next_cursor 逐页取回。
async function collectPages<T>(path: string, query: Record<string, string | number | boolean | undefined>): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const response = await request<Page<T> | T[]>(`${path}${params({ ...query, limit: 50, cursor })}`)
    items.push(...pageItems(response))
    cursor = Array.isArray(response) ? undefined : response.next_cursor || undefined
    if (!cursor) break
  }
  return items
}

function localAsset(url: string) {
  if (!url) return '/dishes/rice-bowl.svg'
  return url.startsWith('/media/') ? new URL(url, apiOrigin).toString() : url
}

function isDemoDescription(description?: string | null) {
  if (!description) return false
  return ['演示生成', '演示菜品', '演示内容', '非门店实测'].some((marker) => description.includes(marker))
}

const categoryIcons: Record<string, string> = {
  bowl: '🍚',
  rice: '🍱',
  noodle: '🍜',
  leaf: '🥗',
  drink: '🧋',
  snack: '🥟',
  cookie: '🥟',
  flame: '🍢',
  cup: '🥤'
}

function toTreeOption(value: ApiTreeNode, kind: 'area' | 'category'): TreeOption {
  return {
    id: value.id,
    label: value.name,
    icon: value.icon ? categoryIcons[value.icon] || value.icon : kind === 'area' ? (value.level === 1 ? '🏫' : '📍') : '🍽️',
    children: value.children?.map((child) => toTreeOption(child, kind))
  }
}

function treeLabel(tree: TreeOption[], id?: string | null): string | undefined {
  if (!id) return undefined
  for (const parent of tree) {
    if (parent.id === id) return parent.label
    const nested: string | undefined = treeLabel(parent.children ?? [], id)
    if (nested) return nested
  }
  return undefined
}

function categoryName(catalog: CatalogData, id?: string | null) {
  return treeLabel(catalog.categories, id) || '校园餐饮'
}

function mapPosition(longitude: number, latitude: number) {
  const x = Math.max(8, Math.min(92, 50 + ((longitude - CAMPUS_CENTER_GCJ02.longitude) / CAMPUS_MAP_SPAN.longitude) * 84))
  const y = Math.max(8, Math.min(88, 50 - ((latitude - CAMPUS_CENTER_GCJ02.latitude) / CAMPUS_MAP_SPAN.latitude) * 80))
  return { x, y }
}

function normalizedMapPositions(features: MerchantFeature[]) {
  if (!features.length) return []
  const longitudes = features.map((feature) => feature.geometry.coordinates[0])
  const latitudes = features.map((feature) => feature.geometry.coordinates[1])
  const centerLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const longitudeSpan = Math.max(0.006, Math.max(...longitudes) - Math.min(...longitudes))
  const latitudeSpan = Math.max(0.006, Math.max(...latitudes) - Math.min(...latitudes))
  return features.map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates
    return {
      x: Math.max(8, Math.min(92, 50 + ((longitude - centerLongitude) / longitudeSpan) * 80)),
      y: Math.max(8, Math.min(88, 50 - ((latitude - centerLatitude) / latitudeSpan) * 80))
    }
  })
}

function toMerchant(value: ApiMerchant, catalog: CatalogData): Merchant {
  const hours = value.business_hours.split('-')
  return {
    id: value.id,
    isDemo: isDemoDescription(value.description),
    name: value.name,
    areaId: value.area_id || '',
    area: value.address,
    categoryId: value.category_id || '',
    category: categoryName(catalog, value.category_id),
    priceLevel: Math.max(1, Math.min(3, value.price_level)) as 1 | 2 | 3,
    rating: value.rating_avg || undefined,
    openUntil: hours[1] || value.business_hours || undefined,
    longitude: value.gcj02_longitude,
    latitude: value.gcj02_latitude,
    position: mapPosition(value.gcj02_longitude, value.gcj02_latitude),
    tags: [categoryName(catalog, value.category_id)]
  }
}

// 推荐流只回传商家名称与地址，其余商家字段留空由渲染层隐藏。
function feedMerchant(value: ApiMenuItem, catalog: CatalogData): Merchant {
  if (value.merchant) return toMerchant(value.merchant, catalog)
  return {
    id: value.merchant_id,
    name: value.merchant_name || '',
    areaId: '',
    area: value.merchant_address || '',
    categoryId: value.category_id || '',
    category: categoryName(catalog, value.category_id),
    tags: [categoryName(catalog, value.category_id)]
  }
}

function toDish(value: ApiMenuItem, merchant: Merchant, catalog: CatalogData): DishCardData {
  return {
    id: value.id,
    isDemo: isDemoDescription(value.description) || merchant.isDemo,
    merchantId: value.merchant_id,
    name: value.name,
    subtitle: value.description,
    image: localAsset(value.image_url),
    gallery: [localAsset(value.image_url)],
    price: value.price_cents / 100,
    rating: value.rating_avg,
    reviewCount: value.review_count,
    categoryId: value.category_id || '',
    category: categoryName(catalog, value.category_id),
    tags: value.tags,
    reason: value.recommendation_reason || undefined,
    ingredients: value.tags,
    merchant
  }
}

function toReview(value: ApiReview): Review {
  return {
    id: value.id,
    dishId: value.menu_item_id,
    userId: value.user_id,
    userName: value.username || '校园同学',
    avatarText: (value.username || '食').slice(0, 1),
    rating: value.rating,
    content: value.text,
    images: value.images.map(localAsset),
    createdAt: new Date(value.created_at).toLocaleDateString('zh-CN'),
    likes: 0,
    status: value.status === 'published' ? 'published' : value.status === 'rejected' ? 'rejected' : value.status === 'hidden' ? 'hidden' : value.status === 'pending_manual' ? 'pending_manual' : 'pending'
  }
}

async function ensureGuestToken() {
  if (localStorage.getItem(accessTokenKey) || localStorage.getItem(guestTokenKey)) return
  if (!guestTokenPromise) {
    guestTokenPromise = (async () => {
      const response = await fetch(`${baseUrl}/auth/guest`, { method: 'POST', headers: { Accept: 'application/json' } })
      if (!response.ok) throw await responseError(response)
      const body = await response.json() as { access_token: string }
      localStorage.setItem(guestTokenKey, body.access_token)
    })()
  }
  const pending = guestTokenPromise
  try {
    await pending
  } finally {
    if (guestTokenPromise === pending) guestTokenPromise = null
  }
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { detail?: unknown; title?: string; message?: string }
    const validationMessage = Array.isArray(body.detail)
      ? body.detail.map((item) => typeof item === 'object' && item && 'msg' in item ? String(item.msg) : String(item)).join('；')
      : undefined
    const detail = typeof body.detail === 'string' ? body.detail : validationMessage
    return new HttpApiError(detail || body.message || body.title || `请求失败（${response.status}）`, response.status)
  } catch {
    return new HttpApiError(`请求失败（${response.status}）`, response.status)
  }
}

function clearUserTokens(notify = false) {
  localStorage.removeItem(accessTokenKey)
  localStorage.removeItem(refreshTokenKey)
  if (notify) window.dispatchEvent(new Event(authExpiredEvent))
}

async function refreshSession() {
  const token = localStorage.getItem(refreshTokenKey)
  if (!token) return false
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: token })
      })
      if (!response.ok) throw await responseError(response)
      savePair(await response.json() as TokenPair)
      return true
    })()
  }
  const pending = refreshPromise
  try {
    return await pending
  } catch {
    clearUserTokens(true)
    return false
  } finally {
    if (refreshPromise === pending) refreshPromise = null
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
  canRefresh = true,
  canRenewGuest = true
): Promise<T> {
  if (authenticated) await ensureGuestToken()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = localStorage.getItem(accessTokenKey) || localStorage.getItem(guestTokenKey)
  if (authenticated && token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  if (response.status === 401 && authenticated) {
    if (localStorage.getItem(accessTokenKey)) {
      if (canRefresh && await refreshSession()) {
        return request<T>(path, init, authenticated, false, canRenewGuest)
      }
      clearUserTokens(true)
      if (canRenewGuest) {
        return request<T>(path, init, authenticated, false, false)
      }
    }
    if (canRenewGuest && !localStorage.getItem(accessTokenKey) && localStorage.getItem(guestTokenKey)) {
      localStorage.removeItem(guestTokenKey)
      return request<T>(path, init, authenticated, canRefresh, false)
    }
  }
  if (!response.ok) throw await responseError(response)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

async function loadCatalog(): Promise<CatalogData> {
  const campuses = await request<ApiCampus[]>('/campuses', {}, false)
  const campus = campuses.find((item) => item.id === configuredCampusId)
    ?? campuses.find((item) => item.is_active)
    ?? campuses[0]
  if (!campus) throw new HttpApiError('暂无可用校区', 503)
  const [areas, categories, tags] = await Promise.all([
    request<ApiTreeNode[]>(`/areas${params({ campus_id: campus.id })}`, {}, false),
    request<ApiTreeNode[]>(`/categories${params({ campus_id: campus.id })}`, {}, false),
    request<ApiTag[]>(`/tags${params({ campus_id: campus.id })}`, {}, false)
  ])
  return {
    campusId: campus.id,
    campusName: campus.name,
    areas: areas.map((item) => toTreeOption(item, 'area')),
    categories: categories.map((item) => toTreeOption(item, 'category')),
    tags
  }
}

function catalog() {
  if (!catalogPromise) {
    catalogPromise = loadCatalog().catch((error) => {
      catalogPromise = null
      throw error
    })
  }
  return catalogPromise
}

function savePair(pair: TokenPair) {
  localStorage.setItem(accessTokenKey, pair.access_token)
  localStorage.setItem(refreshTokenKey, pair.refresh_token)
  localStorage.removeItem(guestTokenKey)
}

async function toUser(value: ApiUser): Promise<User> {
  let stats: ApiStats = { published_reviews: 0, total_views: 0, favorite_merchants: 0 }
  if (localStorage.getItem(accessTokenKey)) {
    try {
      const catalogData = await catalog()
      stats = await request<ApiStats>(`/me/stats${params({ campus_id: catalogData.campusId })}`)
    } catch { /* Profile remains usable. */ }
  }
  return {
    id: value.id,
    username: value.username,
    email: value.email,
    displayName: value.username,
    publishedReviews: stats.published_reviews,
    views: stats.total_views,
    emailVerified: value.email_verified
  }
}

class HttpFoodieApi implements FoodieApi {
  async getCatalog() {
    return catalog()
  }

  async getRecommendations(filters: FeedFilters, cursor?: string) {
    const catalogData = await this.getCatalog()
    const page = await request<Page<ApiMenuItem>>(`/recommendations/feed${params({
      campus_id: catalogData.campusId,
      category_id: filters.categoryId,
      area_id: filters.areaId,
      search: filters.query,
      cursor
    })}`)
    const items = page.items.map((item) => toDish(item, feedMerchant(item, catalogData), catalogData))
    return { items, nextCursor: page.next_cursor || undefined }
  }

  async getDish(id: string) {
    const catalogData = await this.getCatalog()
    const item = await request<ApiMenuItem>(`/menu-items/${id}${params({ campus_id: catalogData.campusId })}`)
      .catch((error) => {
        if (error instanceof HttpApiError && error.status === 404) return undefined
        throw error
      })
    if (!item) return undefined
    const merchantValue = item.merchant || await request<ApiMerchant>(`/merchants/${item.merchant_id}${params({ campus_id: catalogData.campusId })}`)
    return toDish(item, toMerchant(merchantValue, catalogData), catalogData)
  }

  async getDishReviews(id: string) {
    const catalogData = await this.getCatalog()
    const page = await request<Page<ApiReview>>(`/menu-items/${id}/reviews${params({ campus_id: catalogData.campusId })}`)
    return page.items.map(toReview)
  }

  async getMerchants(filters: MapFilters) {
    const catalogData = await this.getCatalog()
    const query = new URLSearchParams({ campus_id: catalogData.campusId, zoom: '18' })
    if (filters.priceLevel) query.append('price_level', String(filters.priceLevel))
    if (filters.categoryId) query.set('category_id', filters.categoryId)
    if (filters.taste) query.set('taste', filters.taste)
    if (filters.query) query.set('search', filters.query)
    if (filters.favoriteOnly) query.set('favorite_only', 'true')
    const [collection, merchantRows] = await Promise.all([
      request<{ features: MerchantFeature[] }>(`/map/merchants?${query}`),
      collectPages<ApiMerchant>('/merchants', { campus_id: catalogData.campusId })
    ])
    const merchantDetails = new Map(merchantRows.map((merchant) => [merchant.id, merchant]))
    const features = collection.features.filter((feature) => feature.properties.kind === 'merchant')
    const positions = normalizedMapPositions(features)
    return features.map((feature, index): Merchant => {
      const id = String(feature.properties.id)
      const details = merchantDetails.get(id)
      const hours = details?.business_hours.split('-') ?? []
      const [longitude, latitude] = feature.geometry.coordinates
      return {
        id,
        isDemo: isDemoDescription(details?.description),
        name: String(feature.properties.name),
        areaId: '',
        area: String(feature.properties.address || ''),
        categoryId: String(feature.properties.category_id || ''),
        category: categoryName(catalogData, String(feature.properties.category_id || '')),
        priceLevel: Math.max(1, Math.min(3, Number(feature.properties.price_level || 2))) as 1 | 2 | 3,
        rating: Number(feature.properties.rating_avg) || undefined,
        openUntil: hours[1] || details?.business_hours || undefined,
        longitude,
        latitude,
        position: positions[index],
        tags: [categoryName(catalogData, String(feature.properties.category_id || ''))]
      }
    })
  }

  async getFavoriteMerchants(_ids: string[]) {
    const catalogData = await this.getCatalog()
    const rows = await collectPages<{ merchant: ApiMerchant }>('/me/favorites', { campus_id: catalogData.campusId })
    return rows.map((item) => toMerchant(item.merchant, catalogData))
  }

  async getMyReviews(_userId: string) {
    const catalogData = await this.getCatalog()
    const rows = await collectPages<ApiReview>('/me/reviews', { campus_id: catalogData.campusId })
    return rows.map((value) => ({
      ...toReview(value),
      dish: value.menu_item_name ? { id: value.menu_item_id, name: value.menu_item_name } : undefined
    }))
  }

  async getMyStats(): Promise<UserStats> {
    const catalogData = await this.getCatalog()
    const value = await request<ApiStats>(`/me/stats${params({ campus_id: catalogData.campusId })}`)
    return {
      publishedReviews: value.published_reviews,
      totalViews: value.total_views,
      favoriteMerchants: value.favorite_merchants
    }
  }

  async login(account: string, password: string) {
    const pair = await request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: account, password, guest_token: localStorage.getItem(guestTokenKey) })
    }, false)
    savePair(pair)
    return toUser(pair.user)
  }

  async register(username: string, email: string, password: string) {
    const pair = await request<TokenPair>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, guest_token: localStorage.getItem(guestTokenKey) })
    }, false)
    savePair(pair)
    return toUser(pair.user)
  }

  async submitReview(user: User, draft: ReviewDraft) {
    const catalogData = await this.getCatalog()
    const images: string[] = []
    for (const image of draft.images) images.push(image.startsWith('data:') ? await this.uploadImage(image) : image)
    const value = await request<ApiReview>(`/menu-items/${draft.dishId}/reviews${params({ campus_id: catalogData.campusId })}`, {
      method: 'POST',
      body: JSON.stringify({ rating: draft.rating, text: draft.content, images })
    })
    const review = toReview(value)
    review.userName = user.displayName
    review.avatarText = user.displayName.slice(0, 1)
    return review
  }

  async setFavorite(merchantId: string, favorite: boolean) {
    const catalogData = await this.getCatalog()
    await request(`/favorites/merchants/${merchantId}${params({ campus_id: catalogData.campusId })}`, { method: favorite ? 'PUT' : 'DELETE' })
  }

  async logout() {
    const refreshToken = localStorage.getItem(refreshTokenKey)
    clearUserTokens()
    if (refreshToken) {
      try { await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false) } catch { /* Local logout still succeeds. */ }
    }
  }

  async getAuthProviders(): Promise<AuthProvider[]> {
    const values = await request<Array<{ id: string; authorize_url: string }>>('/auth/providers', {}, false)
    const apiOrigin = new URL(baseUrl).origin
    return values.map((value) => ({
      id: value.id,
      authorizeUrl: value.authorize_url.startsWith('http') ? value.authorize_url : new URL(value.authorize_url, apiOrigin).toString()
    }))
  }

  async requestEmailVerification(): Promise<AccountActionResult> {
    const value = await request<{ message: string; debug_token?: string | null }>('/auth/email-verification/request', { method: 'POST' })
    return { message: value.message, debugToken: value.debug_token || undefined }
  }

  async confirmEmailVerification(token: string) {
    const value = await request<ApiUser>('/auth/email-verification/confirm', { method: 'POST', body: JSON.stringify({ token }) }, false)
    return toUser(value)
  }

  async forgotPassword(email: string): Promise<AccountActionResult> {
    const value = await request<{ message: string; debug_token?: string | null }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }, false)
    return { message: value.message, debugToken: value.debug_token || undefined }
  }

  async resetPassword(token: string, password: string) {
    await request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, new_password: password }) }, false)
  }

  async getPreferences(): Promise<FoodPreferences> {
    const catalogData = await this.getCatalog()
    const value = await request<{
      tastes: string[]
      avoid: string[]
      budget_max_cents?: number | null
      frequent_area_ids: string[]
    }>(`/me/preferences${params({ campus_id: catalogData.campusId })}`)
    return {
      tastes: value.tastes,
      avoid: value.avoid,
      budgetMaxCents: value.budget_max_cents ?? undefined,
      frequentAreaIds: value.frequent_area_ids
    }
  }

  async updatePreferences(preferences: FoodPreferences): Promise<FoodPreferences> {
    const catalogData = await this.getCatalog()
    const value = await request<{
      tastes: string[]
      avoid: string[]
      budget_max_cents?: number | null
      frequent_area_ids: string[]
    }>('/me/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        campus_id: catalogData.campusId,
        tastes: preferences.tastes,
        avoid: preferences.avoid,
        budget_max_cents: preferences.budgetMaxCents ?? null,
        frequent_area_ids: preferences.frequentAreaIds
      })
    })
    return {
      tastes: value.tastes,
      avoid: value.avoid,
      budgetMaxCents: value.budget_max_cents ?? undefined,
      frequentAreaIds: value.frequent_area_ids
    }
  }

  async recordInteractions(events: InteractionEventInput[]) {
    if (!events.length) return
    const catalogData = await this.getCatalog()
    await request('/interactions', {
      method: 'POST',
      body: JSON.stringify({
        campus_id: catalogData.campusId,
        events: events.map((event) => ({
          event_id: event.eventId,
          event_type: event.eventType,
          menu_item_id: event.dishId,
          merchant_id: event.merchantId,
          metadata: event.metadata ?? {}
        }))
      })
    })
  }

  async viewReview(reviewId: string, eventId: string) {
    const catalogData = await this.getCatalog()
    await request(`/reviews/${reviewId}/view`, {
      method: 'POST',
      body: JSON.stringify({ campus_id: catalogData.campusId, event_id: eventId })
    })
  }

  private async uploadImage(dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob()
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
    const form = new FormData()
    form.append('file', blob, `review-${Date.now()}.${extension}`)
    const uploaded = await request<{ url: string }>('/uploads/images', { method: 'POST', body: form })
    return uploaded.url
  }
}

export const httpApi: FoodieApi = new HttpFoodieApi()

function isRemoteUnavailable(error: unknown) {
  return error instanceof TypeError || (error instanceof HttpApiError && error.status >= 500)
}

async function attempt<T>(primary: () => Promise<T>, fallback: () => Promise<T>) {
  try { return await primary() } catch (error) {
    if (!isRemoteUnavailable(error)) throw error
    console.warn('[User API] Remote request failed, using mock fallback.', error)
    window.dispatchEvent(new Event(degradedDataEvent))
    return fallback()
  }
}

// 只有公开的展示型只读数据可以降级到演示数据；认证、个人数据和写操作必须如实失败。
export function createFallbackFoodieApi(primary: FoodieApi, secondary: FoodieApi): FoodieApi {
  return {
    getCatalog: () => attempt(() => primary.getCatalog(), () => secondary.getCatalog()),
    getRecommendations: (filters, cursor) => attempt(() => primary.getRecommendations(filters, cursor), () => secondary.getRecommendations(filters, cursor)),
    getDish: (id) => attempt(() => primary.getDish(id), () => secondary.getDish(id)),
    getDishReviews: (id) => attempt(() => primary.getDishReviews(id), () => secondary.getDishReviews(id)),
    getMerchants: (filters) => attempt(() => primary.getMerchants(filters), () => secondary.getMerchants(filters)),
    getFavoriteMerchants: (ids) => primary.getFavoriteMerchants(ids),
    getMyReviews: (userId) => primary.getMyReviews(userId),
    getMyStats: () => primary.getMyStats(),
    login: (account, password) => primary.login(account, password),
    register: (username, email, password) => primary.register(username, email, password),
    submitReview: (user, draft) => primary.submitReview(user, draft),
    setFavorite: (merchantId, favorite) => primary.setFavorite(merchantId, favorite),
    logout: () => primary.logout(),
    getAuthProviders: () => primary.getAuthProviders(),
    requestEmailVerification: () => primary.requestEmailVerification(),
    confirmEmailVerification: (token) => primary.confirmEmailVerification(token),
    forgotPassword: (email) => primary.forgotPassword(email),
    resetPassword: (token, password) => primary.resetPassword(token, password),
    getPreferences: () => primary.getPreferences(),
    updatePreferences: (preferences) => primary.updatePreferences(preferences),
    recordInteractions: (events) => primary.recordInteractions(events),
    viewReview: (reviewId, eventId) => primary.viewReview(reviewId, eventId)
  }
}

export function resetHttpApiCacheForTests() {
  guestTokenPromise = null
  refreshPromise = null
  catalogPromise = null
}
