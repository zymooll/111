import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  logout: () => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readJson<User | null>(USER_KEY, null))
  const [favorites, setFavorites] = useState<string[]>(() => readJson<string[]>(FAVORITES_KEY, apiMode === 'mock' ? ['m1', 'm3'] : []))
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readJson<ThemeMode>(THEME_KEY, 'system'))

  useEffect(() => localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)), [favorites])
  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  }, [user])

  useEffect(() => {
    const expire = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire)
  }, [])

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

  const toggleFavorite = useCallback((merchantId: string) => {
    setFavorites((current) => {
      const favorite = !current.includes(merchantId)
      const next = favorite ? [...current, merchantId] : current.filter((id) => id !== merchantId)
      void api.setFavorite(merchantId, favorite).catch(() => {
        setFavorites((latest) => favorite
          ? latest.filter((id) => id !== merchantId)
          : latest.includes(merchantId) ? latest : [...latest, merchantId])
      })
      if (favorite) {
        void api.recordInteractions([{
          eventId: newEventId('favorite'),
          eventType: 'favorite',
          merchantId,
          metadata: { source: 'favorite_toggle' }
        }]).catch(() => undefined)
      }
      return next
    })
  }, [])

  const login = useCallback(async (account: string, password: string) => {
    const nextUser = await api.login(account, password)
    setUser(nextUser)
    try {
      const synced = await api.getFavoriteMerchants(favorites)
      setFavorites((current) => [...new Set([...current, ...synced.map((merchant) => merchant.id)])])
    } catch { /* Login remains successful when favorite sync is temporarily unavailable. */ }
    return nextUser
  }, [favorites])

  const register = useCallback(async (username: string, email: string, password: string) => {
    const nextUser = await api.register(username, email, password)
    setUser(nextUser)
    try {
      const synced = await api.getFavoriteMerchants(favorites)
      setFavorites((current) => [...new Set([...current, ...synced.map((merchant) => merchant.id)])])
    } catch { /* Registration remains successful when favorite sync is temporarily unavailable. */ }
    return nextUser
  }, [favorites])

  const updateUser = useCallback((nextUser: User) => setUser(nextUser), [])
  const logout = useCallback(() => {
    void api.logout()
    clearPrivateDrafts()
    setUser(null)
  }, [])
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
