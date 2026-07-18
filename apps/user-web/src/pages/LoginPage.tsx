import { useEffect, useState, type FormEvent } from 'react'
import { Button, Toast } from 'antd-mobile'
import { Eye, EyeOff, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api } from '../services/api'
import { useAppState } from '../store/AppState'
import type { AuthProvider } from '../types'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAppState()
  const [account, setAccount] = useState('demo')
  const [password, setPassword] = useState('Demo123!')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<AuthProvider[]>([])
  const next = (location.state as { next?: string } | null)?.next ?? '/mine'

  useEffect(() => { void api.getAuthProviders().then(setProviders).catch(() => setProviders([])) }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      await login(account, password)
      Toast.show({ icon: 'success', content: '登录成功，游客收藏已同步' })
      navigate(next, { replace: true })
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '登录失败' })
    } finally { setLoading(false) }
  }

  return (
    <div className="page auth-page">
      <PageHeader title="登录" />
      <section className="auth-hero"><span className="auth-logo">🍽️<i><Sparkles size={15} /></i></span><h1>欢迎回到校园食刻</h1><p>你的收藏和口味偏好，都在等你</p></section>
      <form className="auth-form" onSubmit={submit}>
        <label><span>账号或邮箱</span><div className="form-control"><Mail size={19} /><input autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入账号或邮箱" /></div></label>
        <label><span>密码</span><div className="form-control"><LockKeyhole size={19} /><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位密码" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="显示或隐藏密码">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <Link className="forgot-link" to="/forgot-password">忘记密码？</Link>
        <Button loading={loading} block color="primary" size="large" type="submit" disabled={!account || password.length < 8}>登录</Button>
      </form>
      {providers.length > 0 && <><div className="auth-divider"><span />或<span /></div><div className="provider-list">{providers.map((provider) => <button className="third-party-placeholder" key={provider.id} type="button" onClick={() => window.location.assign(provider.authorizeUrl)}><span>＋</span>使用 {provider.id} 登录</button>)}</div></>}
      <p className="auth-switch">还没有账号？<Link to="/register" state={{ next }}>立即注册</Link></p>
      <div className="auth-tip">演示账号 demo / Demo123! 已自动填入</div>
    </div>
  )
}
