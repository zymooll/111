import { useState, type FormEvent } from 'react'
import { Button, Toast } from 'antd-mobile'
import { LockKeyhole } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { api } from '../services/api'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirm) return Toast.show({ icon: 'fail', content: '两次输入的密码不一致' })
    setLoading(true)
    try {
      await api.resetPassword(token, password)
      Toast.show({ icon: 'success', content: '密码已重置，请重新登录' })
      navigate('/login', { replace: true })
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '重置失败' })
    } finally { setLoading(false) }
  }

  return (
    <div className="page auth-page">
      <PageHeader title="设置新密码" />
      <section className="auth-copy"><h1>创建新的登录密码</h1><p>密码至少 8 位，建议包含字母和数字</p></section>
      <form className="auth-form" onSubmit={submit}>
        <label><span>重置令牌</span><div className="form-control"><LockKeyhole size={19} /><input value={token} onChange={(event) => setToken(event.target.value)} placeholder="邮件中的一次性令牌" /></div></label>
        <label><span>新密码</span><div className="form-control"><LockKeyhole size={19} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></div></label>
        <label><span>确认密码</span><div className="form-control"><LockKeyhole size={19} /><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再次输入新密码" /></div></label>
        <Button loading={loading} block color="primary" size="large" type="submit" disabled={token.length < 20 || password.length < 8}>重置密码</Button>
      </form>
    </div>
  )
}
