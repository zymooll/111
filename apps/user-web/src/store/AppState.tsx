import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { demoFavoriteMerchantIds } from '../data/mockData'
import { api, apiMode } from '../services/api'
import { newEventId } from '../services/interactions'
import type { ThemeMode, User } from '../types'

const FAVORITES_KEY = 'campus-foodie:favorites'
const USER_KEY = 'campus-foodie:user'
const THEME_KEY = 'campus-foodie:theme'
const AUTH_EXPIRED_EVENT = 'campus-foodie:auth-expired'
const REVIEW_DRAFT_PREFIX = 'campus-foodie:review-draft:'

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

function clearPrivateDrafts() {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
  keys.forEach((key) => {
    if (key?.startsWith(REVIEW_DRAFT_PREFIX)) sessionStorage.removeItem(key)
  })
}

interface AppStateValue {
  user: User | null
  favorites: string[]
  themeMode: ThemeMode
  isFavorite: (merchantId: string) => boolean
  toggleFavorite: (merchantId: string) => void
  setThemeMode: (mode: ThemeMode) => void
  login: (account: string, password: string) => Promise<User>
  register: (username: string, email: string, password: string) => Promise<User>
  updateUser: (user: User) => void
  logout: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(() => readJson<User | null>(USER_KEY, null))
  const [favorites, setFavorites] = useState<string[]>(() => user ? [] : readJson<string[]>(FAVORITES_KEY, apiMode === 'mock' ? demoFavoriteMerchantIds : []))
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readJson<ThemeMode>(THEME_KEY, 'system'))
  const pendingFavorites = useRef(new Map<string, { desired: boolean; restore: boolean }>())

  useEffect(() => {
    if (user) localStorage.removeItem(FAVORITES_KEY)
    else localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  }, [favorites, user])
  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  }, [user])

  useEffect(() => {
    const expire = () => {
      clearPrivateDrafts()
      queryClient.clear()
      setFavorites([])
      setUser(null)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire)
  }, [queryClient])

  // 登录态下服务端是收藏的真相来源。守卫必须放在异步结果里：放在发起前会被 StrictMode
  // 的二次挂载吃掉——第一轮标记已水合并被 cleanup 取消，第二轮直接返回，收藏永远是空的。
  useEffect(() => {
    if (!user) return
    let active = true
    void api.getFavoriteMerchants([]).then((rows) => {
      if (!active) return
      const remote = rows.map((merchant) => merchant.id)
      setFavorites((current) => [...new Set([...current, ...remote])])
    }).catch(() => undefined)
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, JSON.stringify(themeMode))
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = themeMode === 'system' ? (media.matches ? 'dark' : 'light') : themeMode
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [themeMode])

  const applyFavorite = useCallback((merchantId: string, favorite: boolean) => {
    setFavorites((current) => {
      if (favorite === current.includes(merchantId)) return current
      return favorite ? [...current, merchantId] : current.filter((id) => id !== merchantId)
    })
  }, [])

  // 同一商家的连点合并为一条请求队列，最终以最后一次意图为准。
  const syncFavorite = useCallback(async (merchantId: string, desired: boolean, restore: boolean) => {
    const queued = pendingFavorites.current.get(merchantId)
    if (queued) {
      queued.desired = desired
      return
    }
    const entry = { desired, restore }
    pendingFavorites.current.set(merchantId, entry)
    try {
      let sent = entry.desired
      await api.setFavorite(merchantId, sent)
      while (sent !== entry.desired) {
        sent = entry.desired
        await api.setFavorite(merchantId, sent)
      }
      if (sent) {
        await api.recordInteractions([{
          eventId: newEventId('favorite'),
          eventType: 'favorite',
          merchantId,
          metadata: { source: 'favorite_toggle' }
        }]).catch(() => undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['my-stats'] })
    } catch {
      applyFavorite(merchantId, entry.restore)
    } finally {
      pendingFavorites.current.delete(merchantId)
    }
  }, [applyFavorite, queryClient])

  const toggleFavorite = useCallback((merchantId: string) => {
    const favorite = !favorites.includes(merchantId)
    applyFavorite(merchantId, favorite)
    void syncFavorite(merchantId, favorite, !favorite)
  }, [applyFavorite, favorites, syncFavorite])

  const login = useCallback(async (account: string, password: string) => {
    const nextUser = await api.login(account, password)
    setUser(nextUser)
    return nextUser
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    const nextUser = await api.register(username, email, password)
    setUser(nextUser)
    return nextUser
  }, [])

  const updateUser = useCallback((nextUser: User) => setUser(nextUser), [])
  const logout = useCallback(async () => {
    clearPrivateDrafts()
    queryClient.clear()
    setFavorites([])
    setUser(null)
    await api.logout().catch(() => undefined)
  }, [queryClient])
  const setThemeMode = useCallback((mode: ThemeMode) => setThemeModeState(mode), [])

  const value = useMemo<AppStateValue>(() => ({
    user,
    favorites,
    themeMode,
    isFavorite: (merchantId) => favorites.includes(merchantId),
    toggleFavorite,
    setThemeMode,
    login,
    register,
    updateUser,
    logout
  }), [favorites, login, logout, register, themeMode, toggleFavorite, updateUser, user])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const value = useContext(AppStateContext)
  if (!value) throw new Error('useAppState must be used within AppStateProvider')
  return value
}
