export type ThemeMode = 'light' | 'dark' | 'system'

export interface TreeOption {
  id: string
  label: string
  icon?: string
  children?: TreeOption[]
}

export interface CatalogTag {
  id: string
  name: string
  kind: string
}

export interface CatalogData {
  campusId: string
  campusName: string
  areas: TreeOption[]
  categories: TreeOption[]
  tags: CatalogTag[]
}

export interface Merchant {
  id: string
  name: string
  areaId: string
  area: string
  categoryId: string
  category: string
  priceLevel: 1 | 2 | 3
  averagePrice: number
  rating: number
  reviewCount: number
  openUntil: string
  distance: number
  longitude?: number
  latitude?: number
  position: { x: number; y: number }
  tags: string[]
}

export interface Dish {
  id: string
  merchantId: string
  name: string
  subtitle: string
  image: string
  gallery: string[]
  price: number
  originalPrice?: number
  rating: number
  reviewCount: number
  categoryId: string
  category: string
  tags: string[]
  reason: string
  match: number
  calories?: number
  waitMinutes?: number
  ingredients: string[]
}

export interface DishCardData extends Dish {
  merchant: Merchant
  favorite: boolean
}

export interface Review {
  id: string
  dishId: string
  userId: string
  userName: string
  avatarText: string
  rating: number
  content: string
  images: string[]
  createdAt: string
  likes: number
  status: 'published' | 'pending' | 'pending_manual' | 'rejected' | 'hidden'
}

export interface User {
  id: string
  username: string
  email: string
  displayName: string
  publishedReviews: number
  views: number
  emailVerified?: boolean
}

export interface UserStats {
  publishedReviews: number
  totalViews: number
  favoriteMerchants: number
}

export interface AccountActionResult {
  message: string
  debugToken?: string
}

export interface AuthProvider {
  id: string
  authorizeUrl: string
}

export interface FeedFilters {
  query?: string
  categoryId?: string
  areaId?: string
}

export interface MapFilters {
  query?: string
  priceLevel?: number
  categoryId?: string
  taste?: string
  favoriteOnly?: boolean
}

export interface ReviewDraft {
  dishId: string
  rating: number
  content: string
  images: string[]
}

export interface FoodPreferences {
  tastes: string[]
  avoid: string[]
  budgetMaxCents?: number
  frequentAreaIds: string[]
}

export interface InteractionEventInput {
  eventId: string
  eventType: 'impression' | 'click' | 'search' | 'favorite' | 'view'
  dishId?: string
  merchantId?: string
  metadata?: Record<string, unknown>
}

export interface RecommendationPage {
  items: DishCardData[]
  nextCursor?: string
}

export interface FoodieApi {
  getCatalog(): Promise<CatalogData>
  getRecommendations(filters: FeedFilters, favorites: string[], cursor?: string): Promise<RecommendationPage>
  getDish(id: string, favorites: string[]): Promise<DishCardData | undefined>
  getDishReviews(id: string): Promise<Review[]>
  getMerchants(filters: MapFilters, favorites: string[]): Promise<Array<Merchant & { favorite: boolean }>>
  getFavoriteMerchants(ids: string[]): Promise<Merchant[]>
  getMyReviews(userId: string): Promise<Array<Review & { dish?: Dish }>>
  getMyStats(): Promise<UserStats>
  login(account: string, password: string): Promise<User>
  register(username: string, email: string, password: string): Promise<User>
  submitReview(user: User, draft: ReviewDraft): Promise<Review>
  setFavorite(merchantId: string, favorite: boolean): Promise<void>
  logout(): Promise<void>
  getAuthProviders(): Promise<AuthProvider[]>
  requestEmailVerification(): Promise<AccountActionResult>
  confirmEmailVerification(token: string): Promise<User>
  forgotPassword(email: string): Promise<AccountActionResult>
  resetPassword(token: string, password: string): Promise<void>
  getPreferences(): Promise<FoodPreferences>
  updatePreferences(preferences: FoodPreferences): Promise<FoodPreferences>
  recordInteractions(events: InteractionEventInput[]): Promise<void>
  viewReview(reviewId: string, eventId: string): Promise<void>
}
