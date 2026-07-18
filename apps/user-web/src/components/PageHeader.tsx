import type { ReactNode } from 'react'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="page-header">
      <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="返回"><ArrowLeft size={22} /></button>
      <div className="page-header__title">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {action ?? <span className="page-header__placeholder"><MoreHorizontal size={22} /></span>}
    </header>
  )
}
