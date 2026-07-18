import type { ReactNode } from 'react'
import { Inbox, RefreshCw } from 'lucide-react'
import { Skeleton } from 'antd-mobile'

export function FeedSkeleton() {
  return (
    <div className="feed-list" aria-label="正在加载推荐">
      {[1, 2, 3].map((item) => (
        <div className="dish-card skeleton-card" key={item}>
          <Skeleton animated className="skeleton-image" />
          <div className="dish-card__content">
            <Skeleton.Title animated />
            <Skeleton.Paragraph animated lineCount={3} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Inbox size={28} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon error"><RefreshCw size={28} /></span>
      <h3>暂时没端上来</h3>
      <p>网络似乎开小差了，稍后再试试。</p>
      <button type="button" className="text-button" onClick={retry}>重新加载</button>
    </div>
  )
}
