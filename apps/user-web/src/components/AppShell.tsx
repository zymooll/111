import type { ReactNode } from 'react'
import { Compass, Map, UserRound } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页', icon: Compass },
  { to: '/map', label: '地图', icon: Map },
  { to: '/mine', label: '我的', icon: UserRound }
]

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const showNavigation = ['/', '/map', '/mine'].includes(location.pathname)

  return (
    <div className="app-shell">
      <main className={showNavigation ? 'app-main with-tabbar' : 'app-main'}>{children}</main>
      {showNavigation && (
        <nav className="bottom-nav" aria-label="主要导航">
          <div className="bottom-nav__inner">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}>
                <span className="bottom-nav__icon"><Icon size={20} strokeWidth={2.25} /></span>
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
