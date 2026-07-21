import { useRef, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Compass, Map, UserRound } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

gsap.registerPlugin(useGSAP)

const navItems = [
  { to: '/', label: '首页', icon: Compass },
  { to: '/map', label: '地图', icon: Map },
  { to: '/mine', label: '我的', icon: UserRound }
]

export function AppShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const showNavigation = ['/', '/map', '/mine'].includes(location.pathname)

  useGSAP(() => {
    const media = gsap.matchMedia()

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const page = shellRef.current?.querySelector<HTMLElement>('.app-main > *')
      if (!page) return

      gsap.fromTo(page,
        { autoAlpha: 0, y: 18, scale: 0.992 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.62,
          ease: 'expo.out',
          clearProps: 'transform,opacity,visibility'
        }
      )
    })

    return () => media.revert()
  }, { scope: shellRef, dependencies: [location.pathname], revertOnUpdate: true })

  useGSAP((_, contextSafe) => {
    if (!contextSafe) return

    const media = gsap.matchMedia()

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const dock = shellRef.current?.querySelector<HTMLElement>('.bottom-nav__inner')
      const items = Array.from(shellRef.current?.querySelectorAll<HTMLElement>('.bottom-nav__item') ?? [])
      if (!dock || !items.length) return

      gsap.fromTo(dock,
        { autoAlpha: 0, y: 88, scale: 0.92 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.78,
          ease: 'expo.out',
          clearProps: 'transform,opacity,visibility'
        }
      )
      gsap.fromTo(items,
        { autoAlpha: 0, y: 12, scale: 0.9 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          stagger: 0.055,
          ease: 'back.out(1.7)',
          clearProps: 'transform,opacity,visibility'
        }
      )

      const press = contextSafe((event: PointerEvent) => {
        gsap.to(event.currentTarget, {
          scale: 0.88,
          duration: 0.12,
          ease: 'power2.out',
          overwrite: 'auto'
        })
      })
      const release = contextSafe((event: PointerEvent) => {
        gsap.to(event.currentTarget, {
          scale: 1,
          duration: 0.48,
          ease: 'elastic.out(1, 0.55)',
          overwrite: 'auto',
          clearProps: 'transform'
        })
      })

      items.forEach((item) => {
        item.addEventListener('pointerdown', press)
        item.addEventListener('pointerup', release)
        item.addEventListener('pointercancel', release)
        item.addEventListener('pointerleave', release)
      })

      return () => {
        items.forEach((item) => {
          item.removeEventListener('pointerdown', press)
          item.removeEventListener('pointerup', release)
          item.removeEventListener('pointercancel', release)
          item.removeEventListener('pointerleave', release)
        })
      }
    })

    return () => media.revert()
  }, { scope: shellRef, dependencies: [showNavigation], revertOnUpdate: true })

  useGSAP(() => {
    const media = gsap.matchMedia()

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const activeIcon = shellRef.current?.querySelector<HTMLElement>('.bottom-nav__item.is-active .bottom-nav__icon')
      if (!activeIcon) return

      gsap.fromTo(activeIcon,
        { y: 2, scale: 0.72 },
        {
          y: 0,
          scale: 1,
          duration: 0.6,
          ease: 'elastic.out(1, 0.5)',
          clearProps: 'transform'
        }
      )
    })

    return () => media.revert()
  }, { scope: shellRef, dependencies: [location.pathname], revertOnUpdate: true })

  return (
    <div ref={shellRef} className="app-shell">
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
