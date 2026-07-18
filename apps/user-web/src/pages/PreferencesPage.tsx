import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Toast } from 'antd-mobile'
import { Check, MapPinned, Save, ShieldCheck, Sparkles, WalletCards } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../services/api'
import type { FoodPreferences } from '../types'

const budgetOptions = [
  { value: undefined, label: '不限' },
  { value: 1500, label: '¥15 内' },
  { value: 2500, label: '¥25 内' },
  { value: 4000, label: '¥40 内' }
]

const emptyPreferences: FoodPreferences = {
  tastes: [],
  avoid: [],
  frequentAreaIds: []
}

export function PreferencesPage() {
  const queryClient = useQueryClient()
  const [preferences, setPreferences] = useState<FoodPreferences>(emptyPreferences)
  const query = useQuery({ queryKey: ['preferences'], queryFn: () => api.getPreferences() })
  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: () => api.getCatalog() })
  const tasteOptions = useMemo(() => [...new Set([
    ...(catalogQuery.data?.tags.filter((tag) => tag.kind === 'taste' || tag.kind === 'diet').map((tag) => tag.name) ?? []),
    ...preferences.tastes
  ])], [catalogQuery.data, preferences.tastes])
  const avoidOptions = useMemo(() => [...new Set([
    ...(catalogQuery.data?.tags.map((tag) => tag.name) ?? []),
    ...preferences.avoid
  ])], [catalogQuery.data, preferences.avoid])
  const areaOptions = useMemo(() => catalogQuery.data?.areas.flatMap((area) => area.children?.length ? area.children : [area]) ?? [], [catalogQuery.data])

  useEffect(() => {
    if (query.data) setPreferences(query.data)
  }, [query.data])

  const mutation = useMutation({
    mutationFn: () => api.updatePreferences(preferences),
    onSuccess: (saved) => {
      queryClient.setQueryData(['preferences'], saved)
      Toast.show({ icon: 'success', content: '口味画像已更新' })
    },
    onError: (error) => Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '保存失败' })
  })

  const toggle = (key: 'tastes' | 'avoid', value: string) => {
    setPreferences((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value]
    }))
  }

  const toggleArea = (areaId: string) => {
    setPreferences((current) => ({
      ...current,
      frequentAreaIds: current.frequentAreaIds.includes(areaId)
        ? current.frequentAreaIds.filter((item) => item !== areaId)
        : [...current.frequentAreaIds, areaId]
    }))
  }

  return (
    <div className="page subpage preferences-page">
      <PageHeader title="口味偏好" subtitle="让推荐更懂你" action={
        <button className="header-text-button" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          <Save size={15} />保存
        </button>
      } />

      <section className="preference-hero">
        <span><Sparkles size={23} /></span>
        <div><h1>你的校园饮食画像</h1><p>明确偏好与近期点击会共同影响菜品排序和推荐理由。</p></div>
      </section>

      {query.isLoading ? <div className="preferences-loading">正在读取偏好…</div> : query.isError ? (
        <button className="preferences-loading" type="button" onClick={() => query.refetch()}>读取失败，点击重试</button>
      ) : (
        <>
          <section className="preference-card">
            <header><div><span>😋</span><div><strong>喜欢的口味与场景</strong><small>可多选，推荐时优先匹配</small></div></div><b>{preferences.tastes.length}</b></header>
            <div className="preference-chips">
              {tasteOptions.map((option) => <button type="button" key={option} className={preferences.tastes.includes(option) ? 'is-active' : ''} onClick={() => toggle('tastes', option)}>{preferences.tastes.includes(option) && <Check size={14} />}{option}</button>)}
            </div>
          </section>

          <section className="preference-card">
            <header><div><span className="preference-icon"><MapPinned size={20} /></span><div><strong>常去地点</strong><small>同等条件下优先推荐附近菜品</small></div></div><b>{preferences.frequentAreaIds.length}</b></header>
            <div className="preference-chips">
              {areaOptions.map((option) => <button type="button" key={option.id} className={preferences.frequentAreaIds.includes(option.id) ? 'is-active' : ''} onClick={() => toggleArea(option.id)}>{preferences.frequentAreaIds.includes(option.id) && <Check size={14} />}{option.icon} {option.label}</button>)}
              {catalogQuery.isLoading && <span className="catalog-inline-state">正在读取校园地点…</span>}
              {catalogQuery.isError && <button type="button" onClick={() => catalogQuery.refetch()}>地点读取失败，点击重试</button>}
            </div>
          </section>

          <section className="preference-card">
            <header><div><span>🛡️</span><div><strong>希望避开的特征</strong><small>命中时将从推荐候选中排除</small></div></div><b>{preferences.avoid.length}</b></header>
            <div className="preference-chips avoid">
              {avoidOptions.map((option) => <button type="button" key={option} className={preferences.avoid.includes(option) ? 'is-active' : ''} onClick={() => toggle('avoid', option)}>{preferences.avoid.includes(option) && <Check size={14} />}{option}</button>)}
            </div>
          </section>

          <section className="preference-card">
            <header><div><span className="preference-icon"><WalletCards size={20} /></span><div><strong>单餐预算</strong><small>推荐流默认不超过该价格</small></div></div></header>
            <div className="budget-options">
              {budgetOptions.map((option) => <button type="button" key={option.label} className={preferences.budgetMaxCents === option.value ? 'is-active' : ''} onClick={() => setPreferences((current) => ({ ...current, budgetMaxCents: option.value }))}>{option.label}</button>)}
            </div>
          </section>
        </>
      )}

      <aside className="profile-privacy-note"><ShieldCheck size={18} /><span><strong>隐私说明</strong>DeepSeek 仅接收去标识化的偏好标签、行为汇总和数据库候选，不接收账号、邮箱、原始搜索文本或评价原文。</span></aside>
      <button className="primary-action preferences-save" type="button" disabled={query.isLoading || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '正在保存…' : '保存口味画像'}</button>
    </div>
  )
}
