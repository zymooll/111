import { useEffect, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import { BadgeCheck, MailCheck } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, updateUser } = useAppState()
  const [token, setToken] = useState(params.get('token') || '')
  const [debugToken, setDebugToken] = useState('')
  const [loading, setLoading] = useState(false)
  const next = (location.state as { next?: string } | null)?.next || '/mine'

  const confirm = async (value = token) => {
    if (!value) return
    setLoading(true)
    try {
      const verified = await api.confirmEmailVerification(value)
      if (user) updateUser({ ...user, ...verified, id: user.id, username: user.username, email: user.email, displayName: user.displayName, emailVerified: true })
      Toast.show({ icon: 'success', content: '邮箱验证成功' })
      navigate(user ? next : '/login', { replace: true })
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '验证失败' })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const queryToken = params.get('token')
    if (queryToken) void confirm(queryToken)
    // URL token should only trigger once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resend = async () => {
    setLoading(true)
    try {
      const result = await api.requestEmailVerification()
      setDebugToken(result.debugToken || '')
      Toast.show({ icon: 'success', content: result.message })
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '发送失败' })
    } finally { setLoading(false) }
  }

  return (
    <div className="page auth-page verify-page">
      <PageHeader title="验证邮箱" />
      <section className="auth-hero"><span className="auth-logo"><MailCheck size={34} /></span><h1>验证你的邮箱</h1><p>{user?.email || '打开验证邮件中的链接，即可发表评价'}</p></section>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void confirm() }}>
        <label><span>验证令牌</span><div className="form-control"><BadgeCheck size={19} /><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="邮件中的一次性令牌" /></div></label>
        <Button loading={loading} block color="primary" size="large" type="submit" disabled={token.length < 20}>完成验证</Button>
        <Button block fill="none" type="button" onClick={resend}>重新发送验证邮件</Button>
      </form>
      {debugToken && <div className="auth-result"><strong>开发环境验证令牌</strong><button type="button" onClick={() => setToken(debugToken)}>{debugToken}</button></div>}
    </div>
  )
}
