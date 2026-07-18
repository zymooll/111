import type {
  AccountActionResult,
  AuthProvider,
  Dish,
  DishCardData,
  FeedFilters,
  FoodieApi,
  FoodPreferences,
  InteractionEventInput,
  MapFilters,
  Merchant,
  Review,
  ReviewDraft,
  User
} from '../types'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '')
const accessTokenKey = 'campus-foodie:access-token'
const refreshTokenKey = 'campus-foodie:refresh-token'
const guestTokenKey = 'campus-foodie:guest-token'
const campusId = '00000000-0000-0000-0000-000000000001'
const authExpiredEvent = 'campus-foodie:auth-expired'
const apiOrigin = new URL(baseUrl, window.location.origin).origin

let guestTokenPromise: Promise<void> | null = null
let refreshPromise: Promise<boolean> | null = null

export class HttpApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'HttpApiError'
  }
}

const categoryAliases: Record<string, string> = {
  staple: '00000000-0000-0000-0000-000000000021',
  rice: '00000000-0000-0000-0000-000000000022',
  noodle: '00000000-0000-0000-0000-000000000023',
  healthy: '00000000-0000-0000-0000-000000000024',
  salad: '00000000-0000-0000-0000-000000000024'
}

const areaAliases: Record<string, string> = {
  north: '00000000-0000-0000-0000-000000000011',
  'north-canteen': '00000000-0000-0000-0000-000000000012',
  south: '00000000-0000-0000-0000-000000000013',
  'south-canteen': '00000000-0000-0000-0000-000000000013'
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

function localAsset(url: string) {
  if (!url) return '/dishes/rice-bowl.svg'
  return url.startsWith('/media/') ? new URL(url, apiOrigin).toString() : url
}

function categoryName(id?: string | null) {
  const names: Record<string, string> = {
    '00000000-0000-0000-0000-000000000021': '中式餐饮',
    '00000000-0000-0000-0000-000000000022': '米饭套餐',
    '00000000-0000-0000-0000-000000000023': '面食粉类',
    '00000000-0000-0000-0000-000000000024': '沙拉轻食'
  }
  return (id && names[id]) || '校园餐饮'
}

function mapPosition(longitude: number, latitude: number) {
  const x = Math.max(8, Math.min(92, ((longitude - 121.473) / 0.011) * 84 + 8))
  const y = Math.max(8, Math.min(88, ((31.233 - latitude) / 0.01) * 80 + 8))
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

function toMerchant(value: ApiMerchant): Merchant {
  const hours = value.business_hours.split('-')
  return {
    id: value.id,
    name: value.name,
    areaId: value.area_id || '',
    area: value.address,
    categoryId: value.category_id || '',
    category: categoryName(value.category_id),
    priceLevel: Math.max(1, Math.min(3, value.price_level)) as 1 | 2 | 3,
    averagePrice: value.price_level * 12,
    rating: value.rating_avg || 0,
    reviewCount: 0,
    openUntil: hours[1] || value.business_hours,
    distance: 400,
    position: mapPosition(value.gcj02_longitude, value.gcj02_latitude),
    tags: [categoryName(value.category_id)]
  }
}

function toDish(value: ApiMenuItem, merchant: Merchant): DishCardData {
  return {
    id: value.id,
    merchantId: value.merchant_id,
    name: value.name,
    subtitle: value.description,
    image: localAsset(value.image_url),
    gallery: [localAsset(value.image_url)],
    price: value.price_cents / 100,
    rating: value.rating_avg,
    reviewCount: value.review_count,
    categoryId: value.category_id || '',
    category: categoryName(value.category_id),
    tags: value.tags,
    reason: value.recommendation_reason || '结合评分、距离与校园热度为你推荐',
    match: Math.max(72, Math.min(98, Math.round(72 + value.rating_avg * 5))),
    waitMinutes: 8,
    ingredients: value.tags,
    merchant,
    favorite: Boolean(value.is_merchant_favorite)
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
    if (canRefresh && localStorage.getItem(accessTokenKey) && await refreshSession()) {
      return request<T>(path, init, authenticated, false, canRenewGuest)
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

function savePair(pair: TokenPair) {
  localStorage.setItem(accessTokenKey, pair.access_token)
  localStorage.setItem(refreshTokenKey, pair.refresh_token)
  localStorage.removeItem(guestTokenKey)
}

async function toUser(value: ApiUser): Promise<User> {
  let stats: ApiStats = { published_reviews: 0, total_views: 0 }
  if (localStorage.getItem(accessTokenKey)) {
    try { stats = await request<ApiStats>('/me/stats') } catch { /* Profile remains usable. */ }
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
  async getRecommendations(filters: FeedFilters, favorites: string[]) {
    const [page, merchantRows] = await Promise.all([
      request<Page<ApiMenuItem>>(`/recommendations/feed${params({
        campus_id: campusId,
        category_id: filters.categoryId ? categoryAliases[filters.categoryId] || filters.categoryId : undefined,
        area_id: filters.areaId ? areaAliases[filters.areaId] || filters.areaId : undefined,
        search: filters.query
      })}`),
      request<ApiMerchant[]>(`/merchants${params({ campus_id: campusId, limit: 100 })}`)
    ])
    const merchants = new Map(merchantRows.map((item) => [item.id, toMerchant(item)]))
    const items = page.items.map((item) => {
      const merchant = merchants.get(item.merchant_id) || toMerchant({
        id: item.merchant_id,
        area_id: null,
        category_id: item.category_id,
        name: item.merchant_name || '校园商家',
        description: '',
        address: item.merchant_address || '校园内',
        gcj02_latitude: 31.228,
        gcj02_longitude: 121.478,
        price_level: 2,
        business_hours: '07:00-21:00',
        is_favorite: favorites.includes(item.merchant_id),
        rating_avg: item.rating_avg
      })
      const dish = toDish(item, merchant)
      dish.favorite = favorites.includes(item.merchant_id) || Boolean(item.is_merchant_favorite)
      return dish
    })
    return { items, nextCursor: page.next_cursor || undefined }
  }

  async getDish(id: string, favorites: string[]) {
    const item = await request<ApiMenuItem>(`/menu-items/${id}`)
    const merchantValue = item.merchant || await request<ApiMerchant>(`/merchants/${item.merchant_id}`)
    const resolved = toMerchant(merchantValue)
    const dish = toDish(item, resolved)
    dish.favorite = favorites.includes(item.merchant_id) || Boolean(item.is_merchant_favorite)
    return dish
  }

  async getDishReviews(id: string) {
    const page = await request<Page<ApiReview>>(`/menu-items/${id}/reviews`)
    return page.items.map(toReview)
  }

  async getMerchants(filters: MapFilters, favorites: string[]) {
    const query = new URLSearchParams({ campus_id: campusId, zoom: '18' })
    if (filters.priceLevel) query.append('price_level', String(filters.priceLevel))
    if (filters.categoryId) query.set('category_id', categoryAliases[filters.categoryId] || filters.categoryId)
    if (filters.taste) query.set('taste', filters.taste)
    if (filters.query) query.set('search', filters.query)
    const collection = await request<{ features: MerchantFeature[] }>(`/map/merchants?${query}`)
    const features = collection.features.filter((feature) => feature.properties.kind === 'merchant')
    const positions = normalizedMapPositions(features)
    return features
      .map((feature, index) => {
        const id = String(feature.properties.id)
        return {
          id,
          name: String(feature.properties.name),
          areaId: '',
          area: String(feature.properties.address || '校园内'),
          categoryId: String(feature.properties.category_id || ''),
          category: categoryName(String(feature.properties.category_id || '')),
          priceLevel: Math.max(1, Math.min(3, Number(feature.properties.price_level || 2))) as 1 | 2 | 3,
          averagePrice: Number(feature.properties.price_level || 2) * 12,
          rating: Number(feature.properties.rating_avg || 0),
          reviewCount: 0,
          openUntil: '21:00',
          distance: 400,
          position: positions[index],
          tags: [categoryName(String(feature.properties.category_id || ''))],
          favorite: Boolean(feature.properties.is_favorite) || favorites.includes(id)
        }
      })
      .filter((merchant) => !filters.favoriteOnly || merchant.favorite)
  }

  async getFavoriteMerchants(ids: string[]) {
    const values = await request<Array<{ merchant: ApiMerchant }>>('/me/favorites')
    const merchants = values.map((item) => toMerchant(item.merchant))
    const known = new Set(merchants.map((merchant) => merchant.id))
    const missingIds = ids.filter((id) => !known.has(id))
    if (missingIds.length) {
      const catalog = await request<ApiMerchant[]>(`/merchants${params({ campus_id: campusId, limit: 100 })}`)
      catalog.forEach((item) => {
        if (missingIds.includes(item.id) && !known.has(item.id)) {
          merchants.push(toMerchant(item))
          known.add(item.id)
        }
      })
    }
    return merchants
  }

  async getMyReviews(_userId: string) {
    const page = await request<Page<ApiReview>>('/me/reviews')
    return page.items.map((value) => ({
      ...toReview(value),
      dish: value.menu_item_name ? {
        id: value.menu_item_id,
        merchantId: '',
        name: value.menu_item_name,
        subtitle: '',
        image: '/dishes/rice-bowl.svg',
        gallery: [],
        price: 0,
        rating: value.rating,
        reviewCount: 0,
        categoryId: '',
        category: '校园餐饮',
        tags: [],
        reason: '',
        match: 0,
        ingredients: []
      } satisfies Dish : undefined
    }))
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
    const images: string[] = []
    for (const image of draft.images) images.push(image.startsWith('data:') ? await this.uploadImage(image) : image)
    const value = await request<ApiReview>(`/menu-items/${draft.dishId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ rating: draft.rating, text: draft.content, images })
    })
    const review = toReview(value)
    review.userName = user.displayName
    review.avatarText = user.displayName.slice(0, 1)
    return review
  }

  async setFavorite(merchantId: string, favorite: boolean) {
    await request(`/favorites/merchants/${merchantId}`, { method: favorite ? 'PUT' : 'DELETE' })
  }

  async logout() {
    const refreshToken = localStorage.getItem(refreshTokenKey)
    if (refreshToken) {
      try { await request('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }, false) } catch { /* Local logout still succeeds. */ }
    }
    clearUserTokens()
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
    const value = await request<{
      tastes: string[]
      avoid: string[]
      budget_max_cents?: number | null
      frequent_area_ids: string[]
    }>('/me/preferences')
    return {
      tastes: value.tastes,
      avoid: value.avoid,
      budgetMaxCents: value.budget_max_cents ?? undefined,
      frequentAreaIds: value.frequent_area_ids
    }
  }

  async updatePreferences(preferences: FoodPreferences): Promise<FoodPreferences> {
    const value = await request<{
      tastes: string[]
      avoid: string[]
      budget_max_cents?: number | null
      frequent_area_ids: string[]
    }>('/me/preferences', {
      method: 'PUT',
      body: JSON.stringify({
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
    await request('/interactions', {
      method: 'POST',
      body: JSON.stringify({
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
    await request(`/reviews/${reviewId}/view`, {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId })
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
    return fallback()
  }
}

export function createFallbackFoodieApi(primary: FoodieApi, secondary: FoodieApi): FoodieApi {
  return {
    getRecommendations: (filters, favorites) => attempt(() => primary.getRecommendations(filters, favorites), () => secondary.getRecommendations(filters, favorites)),
    getDish: (id, favorites) => attempt(() => primary.getDish(id, favorites), () => secondary.getDish(id, favorites)),
    getDishReviews: (id) => attempt(() => primary.getDishReviews(id), () => secondary.getDishReviews(id)),
    getMerchants: (filters, favorites) => attempt(() => primary.getMerchants(filters, favorites), () => secondary.getMerchants(filters, favorites)),
    getFavoriteMerchants: (ids) => attempt(() => primary.getFavoriteMerchants(ids), () => secondary.getFavoriteMerchants(ids)),
    getMyReviews: (userId) => attempt(() => primary.getMyReviews(userId), () => secondary.getMyReviews(userId)),
    login: (account, password) => attempt(() => primary.login(account, password), () => secondary.login(account, password)),
    register: (username, email, password) => attempt(() => primary.register(username, email, password), () => secondary.register(username, email, password)),
    submitReview: (user, draft) => attempt(() => primary.submitReview(user, draft), () => secondary.submitReview(user, draft)),
    setFavorite: (merchantId, favorite) => attempt(() => primary.setFavorite(merchantId, favorite), () => secondary.setFavorite(merchantId, favorite)),
    logout: () => attempt(() => primary.logout(), () => secondary.logout()),
    getAuthProviders: () => attempt(() => primary.getAuthProviders(), () => secondary.getAuthProviders()),
    requestEmailVerification: () => attempt(() => primary.requestEmailVerification(), () => secondary.requestEmailVerification()),
    confirmEmailVerification: (token) => attempt(() => primary.confirmEmailVerification(token), () => secondary.confirmEmailVerification(token)),
    forgotPassword: (email) => attempt(() => primary.forgotPassword(email), () => secondary.forgotPassword(email)),
    resetPassword: (token, password) => attempt(() => primary.resetPassword(token, password), () => secondary.resetPassword(token, password)),
    getPreferences: () => attempt(() => primary.getPreferences(), () => secondary.getPreferences()),
    updatePreferences: (preferences) => attempt(() => primary.updatePreferences(preferences), () => secondary.updatePreferences(preferences)),
    recordInteractions: (events) => attempt(() => primary.recordInteractions(events), () => secondary.recordInteractions(events)),
    viewReview: (reviewId, eventId) => attempt(() => primary.viewReview(reviewId, eventId), () => secondary.viewReview(reviewId, eventId))
  }
}
