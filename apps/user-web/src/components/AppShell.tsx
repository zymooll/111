import type { ReactNode } from 'react'
import { Home, Map, Plus, UserRound } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/map', label: '地图', icon: Map },
  { to: '/mine', label: '我的', icon: UserRound }
]

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const showNavigation = ['/', '/map', '/mine'].includes(location.pathname)

  return (
    <div className="app-shell">
      <main className={showNavigation ? 'app-main with-tabbar' : 'app-main'}>{children}</main>
      {showNavigation && (
        <nav className="bottom-nav" aria-label="主要导航">
          <div className="bottom-nav__inner">
            {navItems.slice(0, 2).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}>
                <Icon size={21} strokeWidth={2.2} />
                <span>{label}</span>
              </NavLink>
            ))}
            <button className="quick-review" type="button" onClick={() => navigate('/review/new')} aria-label="我也吃过，发表评价">
              <span className="quick-review__circle"><Plus size={27} strokeWidth={2.6} /></span>
              <span>我也吃过</span>
            </button>
            {navItems.slice(2).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}>
                <Icon size={21} strokeWidth={2.2} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
