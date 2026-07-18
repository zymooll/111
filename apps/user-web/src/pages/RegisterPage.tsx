import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Toast } from 'antd-mobile'
import { AtSign, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { useAppState } from '../store/AppState'

export function RegisterPage() {
  const { register } = useAppState()
  const navigate = useNavigate()
  const location = useLocation()
  const next = (location.state as { next?: string } | null)?.next ?? '/mine'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreed, setAgreed] = useState(true)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirm) return Toast.show({ icon: 'fail', content: '两次输入的密码不一致' })
    setLoading(true)
    try {
      await register(username, email, password)
      Toast.show({ icon: 'success', content: '注册成功，验证邮件已发送' })
      navigate('/verify-email', { replace: true, state: { next } })
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '注册失败' })
    } finally { setLoading(false) }
  }

  return (
    <div className="page auth-page register-page">
      <PageHeader title="创建账号" />
      <section className="auth-copy"><h1>开启你的校园美食档案</h1><p>一分钟注册，收藏与评价从此不丢失</p></section>
      <form className="auth-form" onSubmit={submit}>
        <label><span>用户名</span><div className="form-control"><UserRound size={19} /><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="至少 3 个字符" /><AtSign size={16} /></div></label>
        <label><span>邮箱</span><div className="form-control"><Mail size={19} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="用于验证与找回密码" /></div></label>
        <label><span>设置密码</span><div className="form-control"><LockKeyhole size={19} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位密码" /></div></label>
        <label><span>确认密码</span><div className="form-control"><LockKeyhole size={19} /><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再次输入密码" /></div></label>
        <label className="agreement"><Checkbox checked={agreed} onChange={setAgreed} /><span>我已阅读并同意《用户协议》和《隐私政策》</span></label>
        <Button loading={loading} block color="primary" size="large" type="submit" disabled={!agreed || username.length < 3 || !email || password.length < 8}>注册并登录</Button>
      </form>
      <p className="auth-switch">已有账号？<Link to="/login" state={{ next }}>直接登录</Link></p>
    </div>
  )
}
