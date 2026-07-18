import { useMemo, useState } from 'react'
import { Check, ChevronRight, RotateCcw } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { areaTree, categoryTree } from '../data/mockData'
import type { TreeOption } from '../types'

export function FilterPage() {
  const { kind } = useParams()
  const [query] = useSearchParams()
  const navigate = useNavigate()
  const tree = kind === 'area' ? areaTree : categoryTree
  const paramName = kind === 'area' ? 'area' : 'category'
  const [activeParent, setActiveParent] = useState(tree[0]?.id ?? '')
  const returnTo = query.get('return') || '/'
  const activeChildren = useMemo(() => tree.find((item) => item.id === activeParent)?.children ?? [], [activeParent, tree])

  const select = (item?: TreeOption) => {
    const url = new URL(returnTo, window.location.origin)
    if (item) url.searchParams.set(paramName, item.id)
    else url.searchParams.delete(paramName)
    navigate(`${url.pathname}${url.search}`)
  }

  return (
    <div className="page subpage filter-page">
      <PageHeader title={kind === 'area' ? '选择地点' : '选择品类'} subtitle="支持一级与二级筛选" action={
        <button type="button" className="header-text-button" onClick={() => select()}><RotateCcw size={15} /> 重置</button>
      } />
      <div className="filter-hero">
        <span>{kind === 'area' ? '📍' : '🥢'}</span>
        <div><h1>{kind === 'area' ? '想去哪里吃？' : '今天馋哪一口？'}</h1><p>{kind === 'area' ? '按校区和生活区域快速定位' : '从大类开始，找到更具体的味道'}</p></div>
      </div>
      <div className="tree-picker">
        <aside className="tree-picker__parents">
          {tree.map((item) => (
            <button type="button" key={item.id} className={activeParent === item.id ? 'is-active' : ''} onClick={() => setActiveParent(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </aside>
        <section className="tree-picker__children">
          <button type="button" className="tree-option featured" onClick={() => select(tree.find((item) => item.id === activeParent))}>
            <span className="tree-option__icon"><Check size={18} /></span>
            <span><strong>全部{tree.find((item) => item.id === activeParent)?.label}</strong><small>查看这个分类下的全部推荐</small></span>
            <ChevronRight size={18} />
          </button>
          {activeChildren.map((item) => (
            <button type="button" className="tree-option" key={item.id} onClick={() => select(item)}>
              <span className="tree-option__icon">{item.icon}</span>
              <span><strong>{item.label}</strong><small>{kind === 'area' ? '查看附近餐饮' : '发现相关菜品与套餐'}</small></span>
              <ChevronRight size={18} />
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}
