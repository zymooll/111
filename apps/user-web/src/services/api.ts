import { CAMPUS_NAME } from '../data/campus'
import { areaTree, categoryTree, demoFavoriteMerchantIds, demoUser, dishes, initialReviews, merchants } from '../data/mockData'
import type { CatalogData, DishCardData, FoodieApi, FoodPreferences, MapFilters, Review, ReviewDraft, User } from '../types'
import { createFallbackFoodieApi, httpApi } from './httpApi'

const wait = (ms = 180) => new Promise((resolve) => window.setTimeout(resolve, ms))
const reviews = [...initialReviews]
const favoriteMerchantIds = new Set(demoFavoriteMerchantIds)
let mockPreferences: FoodPreferences = {
  tastes: ['清淡', '高蛋白'],
  avoid: [],
  budgetMaxCents: 3000,
  frequentAreaIds: []
}

function matchesCategory(itemCategory: string, selected?: string) {
  if (!selected) return true
  if (itemCategory === selected) return true
  return categoryTree.find((parent) => parent.id === selected)?.children?.some((child) => child.id === itemCategory) ?? false
}

function matchesArea(itemArea: string, selected?: string) {
  if (!selected) return true
  if (itemArea === selected) return true
  return areaTree.find((parent) => parent.id === selected)?.children?.some((child) => child.id === itemArea) ?? false
}

function dishCard(id: string): DishCardData | undefined {
  const dish = dishes.find((item) => item.id === id)
  if (!dish) return undefined
  const merchant = merchants.find((item) => item.id === dish.merchantId)
  if (!merchant) return undefined
  return { ...dish, merchant }
}

class MockFoodieApi implements FoodieApi {
  async getCatalog(): Promise<CatalogData> {
    await wait(40)
    const dietTags = new Set(['高蛋白', '素食友好', '低糖'])
    const tags = [...new Set(dishes.flatMap((dish) => dish.tags))].map((name) => ({
      id: `mock-tag-${name}`,
      name,
      kind: dietTags.has(name) ? 'diet' : 'taste'
    }))
    const cloneTree = (tree: typeof areaTree) => tree.map((item) => ({
      ...item,
      children: item.children?.map((child) => ({ ...child }))
    }))
    return {
      campusId: 'mock-campus',
      campusName: CAMPUS_NAME,
      areas: cloneTree(areaTree),
      categories: cloneTree(categoryTree),
      tags
    }
  }

  async getRecommendations(filters: { query?: string; categoryId?: string; areaId?: string }, _cursor?: string) {
    await wait()
    const query = filters.query?.trim().toLowerCase()
    const items = dishes
      .map((dish) => dishCard(dish.id))
      .filter((item): item is DishCardData => Boolean(item))
      .filter((item) => matchesCategory(item.categoryId, filters.categoryId))
      .filter((item) => matchesArea(item.merchant.areaId, filters.areaId))
      .filter((item) => !query || [item.name, item.subtitle, item.merchant.name, ...item.tags].join(' ').toLowerCase().includes(query))
      .sort((a, b) => (b.match ?? 0) - (a.match ?? 0))
    return { items }
  }

  async getDish(id: string) {
    await wait(100)
    return dishCard(id)
  }

  async getDishReviews(id: string) {
    await wait(120)
    return reviews.filter((review) => review.dishId === id && review.status !== 'pending')
  }

  async getMerchants(filters: MapFilters) {
    await wait(160)
    const query = filters.query?.trim().toLowerCase()
    return merchants
      .filter((merchant) => !filters.priceLevel || merchant.priceLevel === filters.priceLevel)
      .filter((merchant) => matchesCategory(merchant.categoryId, filters.categoryId))
      .filter((merchant) => !filters.taste || merchant.tags.includes(filters.taste))
      .filter((merchant) => !filters.favoriteOnly || favoriteMerchantIds.has(merchant.id))
      .filter((merchant) => !query || [merchant.name, merchant.area, merchant.category, ...merchant.tags].join(' ').toLowerCase().includes(query))
      .map((merchant) => ({ ...merchant }))
  }

  async getFavoriteMerchants(ids: string[]) {
    await wait(80)
    return merchants.filter((merchant) => ids.includes(merchant.id))
  }

  async getMyReviews(userId: string) {
    await wait(100)
    return reviews
      .filter((review) => review.userId === userId)
      .map((review) => ({ ...review, dish: dishes.find((dish) => dish.id === review.dishId) }))
  }

  async getMyStats() {
    await wait(60)
    return {
      publishedReviews: demoUser.publishedReviews,
      totalViews: demoUser.views,
      favoriteMerchants: 0
    }
  }

  async login(account: string, password: string): Promise<User> {
    await wait(360)
    if (!account.trim() || password.length < 8) throw new Error('账号或密码不正确')
    return { ...demoUser, username: account.includes('@') ? demoUser.username : account }
  }

  async register(username: string, email: string, password: string): Promise<User> {
    await wait(420)
    if (username.trim().length < 2) throw new Error('用户名至少需要 2 个字符')
    if (!email.includes('@')) throw new Error('请输入有效邮箱')
    if (password.length < 8) throw new Error('密码至少需要 8 位')
    return { id: `u-${Date.now()}`, username, email, displayName: username, publishedReviews: 0, views: 0, emailVerified: false }
  }

  async submitReview(user: User, draft: ReviewDraft): Promise<Review> {
    await wait(460)
    const review: Review = {
      id: `r-${Date.now()}`,
      dishId: draft.dishId,
      userId: user.id,
      userName: user.displayName,
      avatarText: user.displayName.slice(0, 1),
      rating: draft.rating,
      content: draft.content,
      images: draft.images,
      createdAt: '刚刚',
      likes: 0,
      status: 'pending'
    }
    reviews.unshift(review)
    return review
  }

  async setFavorite(merchantId: string, favorite: boolean) {
    await wait(20)
    if (favorite) favoriteMerchantIds.add(merchantId)
    else favoriteMerchantIds.delete(merchantId)
  }
  async logout() { await wait(20) }
  async getAuthProviders() { return [] }
  async requestEmailVerification() {
    await wait(80)
    return { message: '演示验证邮件已发送', debugToken: 'mock-email-verification-token' }
  }
  async confirmEmailVerification(_token: string) {
    await wait(80)
    return { ...demoUser, emailVerified: true }
  }
  async forgotPassword(_email: string) {
    await wait(80)
    return { message: '如果邮箱已注册，重置邮件将很快送达', debugToken: 'mock-password-reset-token' }
  }
  async resetPassword(_token: string, _password: string) { await wait(80) }
  async getPreferences() {
    await wait(60)
    return { ...mockPreferences, tastes: [...mockPreferences.tastes], avoid: [...mockPreferences.avoid], frequentAreaIds: [...mockPreferences.frequentAreaIds] }
  }
  async updatePreferences(preferences: FoodPreferences) {
    await wait(100)
    mockPreferences = { ...preferences, tastes: [...preferences.tastes], avoid: [...preferences.avoid], frequentAreaIds: [...preferences.frequentAreaIds] }
    return this.getPreferences()
  }
  async recordInteractions() { await wait(10) }
  async viewReview() { await wait(10) }
}

export const mockApi: FoodieApi = new MockFoodieApi()
export const apiMode = import.meta.env.VITE_API_MODE ?? 'remote'
export const api: FoodieApi = apiMode === 'remote'
  ? httpApi
  : apiMode === 'fallback'
    ? createFallbackFoodieApi(httpApi, mockApi)
    : mockApi
